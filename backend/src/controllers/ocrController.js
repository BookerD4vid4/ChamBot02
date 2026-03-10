const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const db = require("../config/supabaseClient");

// ─── Multer (in-memory for OCR) ─────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg|png|webp|gif/.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error("Only image files are allowed"));
    },
});

// ─── Gemini client ───────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ─── OCR Scan ───────────────────────────────────────────────────────────────
const scanImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "กรุณาอัปโหลดรูปภาพ" });
    }

    try {
        const base64Image = req.file.buffer.toString("base64");

        const prompt = `
วิเคราะห์รูปภาพนี้และดึงข้อมูลสินค้าทุกชิ้นที่เห็นออกมา
ถ้าเป็นใบเสร็จ รายการสั่งซื้อ หรือรายการสินค้า ให้ดึงทุกรายการ
ถ้าเป็นรูปสินค้า ให้ดึงข้อมูลสินค้านั้น

ตอบเป็น JSON array เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown:
[
  {
    "name": "ชื่อสินค้า (ต้องมี)",
    "description": "รายละเอียดสินค้า หรือ null",
    "sku": "รหัสสินค้าหรือบาร์โค้ด หรือ null",
    "price": ตัวเลขราคาต่อหน่วย (number หรือ null),
    "stock_quantity": จำนวนสินค้า (number, default 1),
    "unit": "หน่วย เช่น ชิ้น, กล่อง, kg หรือ null",
    "category_name": "หมวดหมู่โดยประมาณ หรือ null",
    "confidence": "high | medium | low"
  }
]

กฎ:
- ห้ามตอบอะไรนอกจาก JSON array
- ถ้าอ่านราคาไม่ได้ให้ใส่ null
- stock_quantity default เป็น 1 ถ้าไม่ระบุในรูป
- ถ้าไม่มีสินค้าในรูปเลย ให้ตอบ []
`;

        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: req.file.mimetype,
            },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const rawText = result.response.text().trim();

        // Parse JSON (strip markdown fences if present)
        let jsonText = rawText;
        const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonText = match[1];

        let products;
        try {
            products = JSON.parse(jsonText);
        } catch {
            return res.status(422).json({
                success: false,
                message: "ไม่สามารถอ่านข้อมูลสินค้าจากรูปภาพได้ กรุณาลองด้วยรูปภาพอื่น",
                raw: rawText,
            });
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                message: "ไม่พบรายการสินค้าในรูปภาพ",
            });
        }

        // ─── Enrich: check if SKU or name already exists ────────────────────
        const enriched = await Promise.all(products.map(async (p) => {
            let existingVariant = null;

            // 1. Try match by SKU first
            if (p.sku) {
                const r = await db.query(
                    `SELECT pv.variant_id, pv.sku, pv.stock_quantity, p.name as product_name, p.product_id
                     FROM product_variants pv
                     JOIN products p ON p.product_id = pv.product_id
                     WHERE pv.sku = $1 LIMIT 1`,
                    [p.sku]
                );
                if (r.rows.length > 0) existingVariant = r.rows[0];
            }

            // 2. Fallback: match by product name (case-insensitive)
            if (!existingVariant && p.name) {
                const r = await db.query(
                    `SELECT pv.variant_id, pv.sku, pv.stock_quantity, p.name as product_name, p.product_id
                     FROM product_variants pv
                     JOIN products p ON p.product_id = pv.product_id
                     WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
                     ORDER BY pv.variant_id ASC LIMIT 1`,
                    [p.name]
                );
                if (r.rows.length > 0) existingVariant = r.rows[0];
            }

            return {
                ...p,
                is_new: !existingVariant,
                existing_variant_id: existingVariant?.variant_id || null,
                existing_variant_stock: existingVariant?.stock_quantity ?? null,
                existing_product_name: existingVariant?.product_name || null,
                // Clear price for existing products — only need qty
                price: existingVariant ? null : p.price,
            };
        }));

        res.status(200).json({ success: true, data: enriched });
    } catch (error) {
        console.error("OCR Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ",
        });
    }
};

module.exports = { upload, scanImage };
