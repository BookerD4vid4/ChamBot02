/**
 * migrate_categories.js
 * -------------------------------------------------------------
 * อัปเดตหมวดหมู่สินค้าเป็น 8 หมวดมาตรฐาน + จัดสินค้าเข้าหมวดใหม่
 * รันด้วย:  node scripts/migrate_categories.js
 */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const NEW_CATEGORIES = [
    "เครื่องดื่ม",
    "อาหารแห้งและเครื่องปรุง",
    "ขนมขบเคี้ยว",
    "ของใช้ส่วนตัว",
    "ผลิตภัณฑ์ทำความสะอาด",
    "ยาสามัญประจำบ้าน",
    "สินค้าเบ็ดเตล็ด",
    "ของสดและอื่นๆ",
];

// mapping slug → new category name
const PRODUCT_CATEGORY_MAP = {
    "arabica-medium":         "เครื่องดื่ม",        // กาแฟอาราบิก้า
    "organic-greentea":       "เครื่องดื่ม",        // ชาเขียวออร์แกนิค
    "strawberry-jam-doi":     "อาหารแห้งและเครื่องปรุง", // แยมสตรอว์เบอร์รี่
    "drip-kettle-600":        "สินค้าเบ็ดเตล็ด",    // กาน้ำ Drip Kettle
    "handmade-ceramic-mug":   "สินค้าเบ็ดเตล็ด",    // แก้วเซรามิค
    "hemp-seed":              "สินค้าเบ็ดเตล็ด",    // เมล็ดพันธุ์กัญชง
    "organic-fertilizer-5kg": "สินค้าเบ็ดเตล็ด",   // ปุ๋ยหมัก
    "portable-rice-mill":     "สินค้าเบ็ดเตล็ด",    // เครื่องสีข้าว
    "basic-barista-course":   "สินค้าเบ็ดเตล็ด",    // Barista Course
    "one-day-farm-trip":      "ของสดและอื่นๆ",      // Farm Trip
};

async function main() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        console.log("🚀 เริ่ม migration...\n");

        // ── Step 1: เพิ่มหมวดหมู่ใหม่ ─────────────────────────────────
        console.log("📂 [1/4] เพิ่มหมวดหมู่ใหม่ 8 หมวด...");
        for (const name of NEW_CATEGORIES) {
            await client.query(
                "INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
                [name]
            );
            console.log(`   ✓ "${name}"`);
        }

        // ── Step 2: ดึง category_id ของหมวดใหม่ ──────────────────────
        const { rows: catRows } = await client.query(
            "SELECT category_id, name FROM categories WHERE name = ANY($1)",
            [NEW_CATEGORIES]
        );
        const catMap = Object.fromEntries(catRows.map(r => [r.name, r.category_id]));

        // ── Step 3: จัด products เข้าหมวดใหม่ ───────────────────────
        console.log("\n📦 [2/4] จัดสินค้าเข้าหมวดหมู่ใหม่...");
        for (const [slug, catName] of Object.entries(PRODUCT_CATEGORY_MAP)) {
            const catId = catMap[catName];
            if (!catId) { console.warn(`   ⚠ ไม่พบ category "${catName}"`); continue; }
            const { rowCount } = await client.query(
                "UPDATE products SET category_id = $1 WHERE slug = $2",
                [catId, slug]
            );
            if (rowCount > 0) console.log(`   ✓ "${slug}" → "${catName}"`);
            else console.warn(`   ⚠ ไม่พบ product slug="${slug}"`);
        }

        // ── Step 4: ลบหมวดเก่าที่ไม่มีสินค้าอีกต่อไป ─────────────────
        console.log("\n🗑️  [3/4] ลบหมวดหมู่เก่าที่ไม่ใช้แล้ว...");
        const { rows: deleted } = await client.query(`
            DELETE FROM categories
            WHERE name NOT IN (${NEW_CATEGORIES.map((_, i) => `$${i + 1}`).join(",")})
            RETURNING name
        `, NEW_CATEGORIES);
        if (deleted.length) deleted.forEach(r => console.log(`   🗑 ลบแล้ว: "${r.name}"`));
        else console.log("   (ไม่มีหมวดเก่าให้ลบ)");

        // ── Step 5: ยืนยัน ─────────────────────────────────────────────
        console.log("\n✅ [4/4] ตรวจสอบผลลัพธ์...");
        const { rows: summary } = await client.query(`
            SELECT c.name, COUNT(p.product_id) AS products
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.category_id
            GROUP BY c.category_id, c.name ORDER BY c.name
        `);
        console.log("\n📊 หมวดหมู่ปัจจุบัน:");
        summary.forEach(r => console.log(`   ${r.name.padEnd(30)} ${r.products} สินค้า`));

        await client.query("COMMIT");
        console.log("\n🎉 Migration สำเร็จ!");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Migration ล้มเหลว:", err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
