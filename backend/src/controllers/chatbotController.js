"use strict";
/**
 * chatbotController.js
 * ---------------------
 * POST /api/chatbot/message
 * Flow: Typhoon tool calling loop → execute tools → return reply + frontend actions
 */

const db = require("../config/supabaseClient");
const { embedQuery } = require("../services/embeddingService");
const { chatWithTools, buildSystemPrompt, TOOLS } = require("../services/typhoonService");
const orderService = require("../services/orderService");
const omiseService = require("../services/omiseService");

// ─── Tool implementations ─────────────────────────────────────────────────────

const toolSearchProducts = async (query) => {
    // 1. Text Keyword Search (Fuzzy Name Match)
    const { rows: textRows } = await db.query(
        `SELECT p.product_id, p.name, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.category_id = p.category_id
         WHERE p.is_active = true AND p.name ILIKE $1
         LIMIT 6`,
        [`%${query}%`]
    );

    // 2. Semantic Vector Search
    let semanticRows = [];
    try {
        const vec = await embedQuery(query);
        const vecStr = `[${vec.join(",")}]`;
        const { rows } = await db.query(
            `SELECT p.product_id, p.name,
                    c.name AS category_name,
                    pe.embedding <=> $1::vector AS distance
             FROM product_embeddings pe
             JOIN products p ON p.product_id = pe.product_id
             LEFT JOIN categories c ON c.category_id = p.category_id
             WHERE p.is_active = true
             ORDER BY distance ASC LIMIT 6`,
            [vecStr]
        );
        semanticRows = rows.filter(r => r.distance < 0.82); // Relaxed threshold for Thai short queries
    } catch (e) {
        console.warn("Embedding search failed, falling back to keyword only:", e.message);
    }

    // Merge and Deduplicate Results
    const mergedMap = new Map();
    textRows.forEach(r => mergedMap.set(r.product_id, r));
    semanticRows.forEach(r => {
        if (!mergedMap.has(r.product_id)) mergedMap.set(r.product_id, r);
    });
    
    const mergedRows = Array.from(mergedMap.values()).slice(0, 6);

    const products = await Promise.all(
        mergedRows.map(async (prod) => {
            const { rows: variants } = await db.query(
                `SELECT variant_id, sku, unit, price, stock_quantity
                 FROM product_variants
                 WHERE product_id = $1 AND is_active = true
                 ORDER BY is_main DESC NULLS LAST LIMIT 5`,
                [prod.product_id]
            );
            return { ...prod, variants };
        })
    );
    if (!products.length) return { found: false, message: "ไม่พบสินค้าที่ตรงกับคำค้นหา" };
    return { found: true, products };
};

const toolGetProductDetails = async (productId) => {
    const { rows: prodRows } = await db.query(
        `SELECT p.product_id, p.name, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.category_id = p.category_id
         WHERE p.product_id = $1::int AND p.is_active = true`,
        [productId]
    );
    if (!prodRows.length) return { found: false, message: "ไม่พบสินค้า" };
    const { rows: variants } = await db.query(
        `SELECT variant_id, sku, unit, price, stock_quantity
         FROM product_variants
         WHERE product_id = $1::int AND is_active = true
         ORDER BY is_main DESC NULLS LAST`,
        [productId]
    );
    return { found: true, product: { ...prodRows[0], variants } };
};

// ดึงคำสั่งซื้อจาก orders.user_id พร้อม items รายละเอียดสินค้า
const toolGetMyOrders = async (userId) => {
    if (!userId) return { error: "กรุณาล็อกอินก่อนดูรายการสั่งซื้อ" };
    try {
        const { rows: orders } = await db.query(
            `SELECT o.order_id, o.status, o.total_amount, o.created_at,
                    (SELECT note FROM order_status_logs
                     WHERE order_id = o.order_id AND status = 'cancelled'
                     ORDER BY created_at DESC LIMIT 1) AS cancel_note
             FROM orders o
             WHERE o.user_id = $1::int
             ORDER BY o.created_at DESC LIMIT 5`,
            [userId]
        );
        if (!orders.length) return { found: false, message: "ยังไม่มีประวัติการสั่งซื้อ" };

        // ดึง items ของแต่ละ order
        const ordersWithItems = await Promise.all(orders.map(async (order) => {
            const { rows: items } = await db.query(
                `SELECT oi.quantity, oi.price,
                        p.product_id, p.name AS product_name,
                        pv.variant_id, pv.sku, pv.unit, pv.image_url
                 FROM order_items oi
                 LEFT JOIN product_variants pv ON pv.variant_id = oi.variant_id
                 LEFT JOIN products p ON p.product_id = pv.product_id
                 WHERE oi.order_id = $1`,
                [order.order_id]
            );
            return { ...order, items };
        }));

        return { found: true, orders: ordersWithItems };
    } catch (err) {
        return { error: "ไม่สามารถดูรายการออเดอร์ได้: " + err.message };
    }
};

// ─── ดึงที่อยู่จัดส่งของ user ─────────────────────────────────────────────────
const toolGetMyAddresses = async (userId) => {
    if (!userId) return { found: false, message: "กรุณาล็อกอินก่อนดูที่อยู่จัดส่ง" };
    try {
        const { rows } = await db.query(
            `SELECT address_id, recipient_name, address_line, province, postal_code
             FROM user_addresses
             WHERE user_id = $1
             ORDER BY address_id DESC`,
            [userId]
        );
        if (!rows.length) return { found: false, message: "ยังไม่มีที่อยู่จัดส่ง กรุณาเพิ่มที่อยู่ในหน้าชำระเงิน" };
        return { found: true, addresses: rows };
    } catch (err) {
        return { error: err.message };
    }
};

// ─── ดึงรายการหมวดหมู่ทั้งหมด ─────────────────────────────────────────────────
const CATEGORY_ICONS = {
    'เครื่องดื่ม':              '🥤',
    'อาหารแห้งและเครื่องปรุง':  '🌾',
    'ขนมขบเคี้ยว':              '🍿',
    'ของใช้ส่วนตัว':            '🧴',
    'ผลิตภัณฑ์ทำความสะอาด':    '🧹',
    'ยาสามัญประจำบ้าน':         '💊',
    'สินค้าเบ็ดเตล็ด':          '🛍️',
    'ของสดและอื่นๆ':            '🥬',
};

const toolGetCategories = async () => {
    try {
        const { rows } = await db.query(
            `SELECT c.category_id, c.name,
                    COUNT(p.product_id) AS product_count
             FROM categories c
             LEFT JOIN products p ON p.category_id = c.category_id AND p.is_active = true
             GROUP BY c.category_id, c.name
             ORDER BY c.name ASC`
        );
        if (!rows.length) return { found: false, message: "ไม่พบหมวดหมู่สินค้า" };
        const categories = rows.map(r => ({
            ...r,
            icon: CATEGORY_ICONS[r.name] || '🛒',
        }));
        return { found: true, categories };
    } catch (err) {
        return { error: err.message };
    }
};

// ─── ดึงสินค้าตามหมวดหมู่ ──────────────────────────────────────────────────────
const toolGetProductsByCategory = async (categoryId, categoryName) => {
    try {
        let catId = categoryId;

        // ถ้าไม่มี categoryId แต่มี categoryName → หา category_id จากชื่อ
        if (!catId && categoryName) {
            const { rows: catRows } = await db.query(
                `SELECT category_id FROM categories
                 WHERE LOWER(TRIM(name)) LIKE LOWER(TRIM($1)) LIMIT 1`,
                [`%${categoryName}%`]
            );
            if (!catRows.length) return { found: false, message: `ไม่พบหมวดหมู่ "${categoryName}"` };
            catId = catRows[0].category_id;
        }

        if (!catId) return { found: false, message: "กรุณาระบุหมวดหมู่" };

        const { rows } = await db.query(
            `SELECT p.product_id, p.name,
                    c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON c.category_id = p.category_id
             WHERE p.category_id = $1::int AND p.is_active = true
             ORDER BY p.name ASC LIMIT 10`,
            [catId]
        );

        if (!rows.length) return { found: false, message: "ไม่มีสินค้าในหมวดหมู่นี้" };

        // ดึง variant (ราคา, สต็อก) ของแต่ละสินค้า
        const products = await Promise.all(
            rows.map(async (prod) => {
                const { rows: variants } = await db.query(
                    `SELECT variant_id, sku, unit, price, stock_quantity
                     FROM product_variants
                     WHERE product_id = $1 AND is_active = true
                     ORDER BY is_main DESC NULLS LAST LIMIT 3`,
                    [prod.product_id]
                );
                return { ...prod, variants };
            })
        );

        return { found: true, products, category_name: products[0]?.category_name };
    } catch (err) {
        return { error: err.message };
    }
};

/**
 * toolAddProductByName: ค้นหาสินค้าจากชื่อ → ดึง variant → คืน add_to_cart action
 * ไม่ต้องการ product_id / variant_id ป้องกัน model ใส่ id ผิด
 */
const toolAddProductByName = async (productName, quantity = 1) => {
    try {
        if (!productName) return { success: false, message: "กรุณาระบุชื่อสินค้า" };
        const qty = Math.max(1, parseInt(quantity) || 1);

        // ค้นหาสินค้าจากชื่อ (fuzzy)
        const { rows: prodRows } = await db.query(
            `SELECT p.product_id, p.name
             FROM products p
             WHERE LOWER(p.name) LIKE LOWER($1) AND p.is_active = true
             ORDER BY LENGTH(p.name) ASC LIMIT 1`,
            [`%${productName}%`]
        );
        if (!prodRows.length) {
            return { success: false, message: `ไม่พบสินค้า "${productName}" ในระบบ` };
        }

        const prod = prodRows[0];
        // ดึง main variant
        const { rows: varRows } = await db.query(
            `SELECT variant_id, sku, price, unit, stock_quantity, image_url
             FROM product_variants
             WHERE product_id = $1 AND is_active = true
             ORDER BY is_main DESC NULLS LAST, variant_id ASC LIMIT 1`,
            [prod.product_id]
        );
        if (!varRows.length) return { success: false, message: `"${prod.name}" ไม่มีตัวเลือกสินค้า` };

        const v = varRows[0];
        if (v.stock_quantity < qty) {
            return { success: false, message: `"${prod.name}" มีสต็อกเพียง ${v.stock_quantity} ${v.unit || "ชิ้น"} ไม่เพียงพอ` };
        }

        const total = (parseFloat(v.price) * qty).toFixed(0);
        return {
            success: true,
            message: `"${prod.name}" × ${qty} ${v.unit || "ชิ้น"} ราคา ฿${total} — (เพิ่มลงตะกร้าของลูกค้าเรียบร้อยแล้ว)`,
            __action: {
                type: "add_to_cart",
                product: { product_id: prod.product_id, name: prod.name },
                variant: {
                    variant_id: v.variant_id,
                    sku: v.sku,
                    price: v.price,
                    unit: v.unit,
                    image_url: v.image_url,
                },
                quantity: qty,
            },
        };
    } catch (err) {
        console.error("[toolAddProductByName]", err.message);
        return { error: err.message };
    }
};

// ─── การสั่งซื้อในแชทบอท ───────────────────────────────────────────────────────
const toolCheckoutOrderInChatbot = async (userId, cartItems, addressId, paymentMethod, actionsOut) => {
    try {
        if (!userId) return { success: false, message: "กรุณาล็อกอินก่อนทำการสั่งซื้อ" };
        if (!cartItems || cartItems.length === 0) return { success: false, message: "ตะกร้าสินค้าว่างเปล่า กรุณาเพิ่มสินค้าก่อน" };
        if (!addressId) return { success: false, message: "กรุณาระบุที่อยู่จัดส่ง" };
        if (!paymentMethod || !['qr', 'cod'].includes(paymentMethod)) return { success: false, message: "วิธีชำระเงินไม่ถูกต้อง (ต้องเป็น qr หรือ cod)" };

        const items = cartItems.map(i => ({
            variant_id: i.variant_id,
            quantity: i.quantity,
            unit_price: i.price,
            price: i.price  // orderRepository uses item.price
        }));

        const total_amount = cartItems.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);

        const payload = {
            user_id: userId,
            address_id: addressId,
            payment_method: paymentMethod,
            total_amount,
            items
        };

        const newOrder = await orderService.createOrder(payload);
        const orderId = newOrder.order_id;
        const totalAmt = newOrder.total_amount;

        const isCOD = paymentMethod === 'cod';

        if (isCOD) {
            // COD: ยังไม่ได้จ่าย → สถานะ pending รอยืนยันจากร้าน
            await db.query(
                `UPDATE orders SET status = 'pending', payment_status = 'pending' WHERE order_id = $1`,
                [orderId]
            );
            await db.query(
                `INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES ($1, 'pending', 'system', 'COD Order Placed')`,
                [orderId]
            );
        } else {
            // PromptPay (DEMO MODE): payment received, set pending for admin to ship
            await db.query(
                `UPDATE orders SET status = 'pending', payment_status = 'paid' WHERE order_id = $1`,
                [orderId]
            );
            await db.query(
                `INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES ($1, 'pending', 'system', 'PromptPay Payment Received')`,
                [orderId]
            );
        }

        actionsOut.push({ type: 'clear_cart' });

        const replyMessage = isCOD
            ? `📦 ได้รับออเดอร์แล้วค่ะ!\nคำสั่งซื้อรหัส #${orderId} ยอดรวม ${totalAmt} บาท อยู่ในสถานะ **รอยืนยัน**\nรอรับสินค้าที่บ้านและชำระเงินกับพนักงานส่งได้เลยนะคะ 🚚`
            : `✅ ชำระเงินเสร็จสิ้น!\nคำสั่งซื้อรหัส #${orderId} ยอดรวม ${totalAmt} บาท ได้รับการยืนยันเรียบร้อยแล้วค่ะ\nรอรับสินค้าที่บ้านชิลๆ ได้เลยนะคะ 🎉`;

        return {
            success: true,
            message: replyMessage,
            order_id: orderId,
            total_amount: totalAmt
        };

    } catch (err) {
        console.error("[toolCheckoutOrderInChatbot]", err.message);
        return { success: false, message: "เกิดข้อผิดพลาดในการสร้างคำสั่งซื้อ: " + err.message };
    }
};

// ─── Tool dispatcher with action collection ───────────────────────────────────
const makeExecuteTool = (userId, actionsOut, cartItems) => async (name, args) => {
    let result;
    switch (name) {
        case "search_products": {
            const query = args.query || "";
            // ถ้า query ตรงกับชื่อหมวดหมู่ ใช้ category search แทน vector search
            const catCheck = await toolGetProductsByCategory(null, query);
            if (catCheck.found) {
                result = catCheck;
            } else {
                result = await toolSearchProducts(query);
            }
            break;
        }
        case "get_product_details":
            result = await toolGetProductDetails(args.product_id);
            break;
        case "get_my_orders":
            result = await toolGetMyOrders(userId);
            // Push reorder action for each order that has items with product/variant info
            if (result.found && result.orders?.length > 0) {
                result.orders.forEach(order => {
                    const reorderItems = (order.items || [])
                        .filter(item => item.product_id && item.variant_id)
                        .map(item => ({
                            product: { product_id: item.product_id, name: item.product_name },
                            variant: { variant_id: item.variant_id, sku: item.sku, price: item.price, unit: item.unit, image_url: item.image_url },
                            quantity: item.quantity
                        }));
                    if (reorderItems.length > 0) {
                        actionsOut.push({ type: 'reorder', order_id: order.order_id, items: reorderItems });
                    }
                });
            }
            break;
        case "add_to_cart":
        case "add_product_to_cart":
            result = await toolAddProductByName(
                args.product_name || args.name || "",
                args.quantity ?? 1
            );
            break;
        case "remove_from_cart":
            actionsOut.push({ type: 'remove_item_from_cart', product_name: args.product_name || args.name });
            result = { success: true, message: `ทำการสั่งหน้าเว็บให้ลบ ${args.product_name} ออกจากตะกร้าแล้ว` };
            break;
        case "update_cart_quantity":
            actionsOut.push({ type: 'update_item_quantity', product_name: args.product_name || args.name, quantity: args.quantity });
            result = { success: true, message: `ทำการสั่งหน้าเว็บให้อัพเดทจำนวน ${args.product_name} เป็น ${args.quantity} ชิ้นแล้ว` };
            break;
        case "checkout_order_in_chatbot":
            result = await toolCheckoutOrderInChatbot(userId, cartItems, args.address_id, args.payment_method, actionsOut);
            break;
        case "get_categories":
            result = await toolGetCategories();
            break;
        case "get_products_by_category":
            result = await toolGetProductsByCategory(args.category_id, args.category_name);
            break;
        case "get_my_addresses":
            result = await toolGetMyAddresses(userId);
            // ให้ frontend แสดง UI ปุ่มให้ลูกค้าจิ้มเลือกที่อยู่ แทนการเด้งไปหน้าชำระเงิน
            if (result.found && result.addresses?.length > 0) {
                actionsOut.push({ type: 'show_address_selection', addresses: result.addresses });
            }
            break;
        default:
            return { error: `Unknown tool: ${name}` };
    }

    if (result?.__action) {
        actionsOut.push(result.__action);
        const { __action, ...clean } = result;
        return clean;
    }
    return result;
};

// ─── POST /api/chatbot/message ────────────────────────────────────────────────
const sendMessage = async (req, res) => {
    const { message, conversationHistory = [], cartItems = [] } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ success: false, message: "กรุณาส่งข้อความ" });
    }

    const cleanMsg = message.trim().toLowerCase();
    
    // ─── Step 2.1: Zero-Cost Intent Matching (Fast Regex) ───
    if (/^(ขอบคุณ|ขอบคุน|ขอบจัย|thx|thank you|thanks)(ครับ|คับ|คัฟ|ค่ะ|คะ|จ้า|จ้ะ)?$/i.test(cleanMsg)) {
        return res.status(200).json({ success: true, reply: "ด้วยความยินดีค่ะ 😊 มีอะไรให้แอดมินช่วยอีก แจ้งได้เลยนะคะ", actions: [] });
    }
    if (/^(ดี|สวัสดี|ดีจ้า|หวัดดี|hi|hello)(ครับ|คับ|คัฟ|ค่ะ|คะ|จ้า|จ้ะ)?$/i.test(cleanMsg)) {
        return res.status(200).json({ success: true, reply: "สวัสดีค่ะ! ยินดีต้อนรับสู่ Chambot Store นะคะ มีสินค้าตัวไหนที่สนใจสอบถามได้เลยค่ะ หรืออยากให้แนะนำหมวดหมู่สินค้าก็ได้นะคะ 😊", actions: [] });
    }
    if (/^(ยกเลิก|ไม่เอา|พอแล้ว|cancel)(ครับ|คับ|คัฟ|ค่ะ|คะ|จ้า|จ้ะ)?$/i.test(cleanMsg)) {
        return res.status(200).json({ success: true, reply: "รับทราบค่ะ หากต้องการให้ช่วยเหลืออะไรเพิ่มเติม พิมพ์บอกได้ตลอดเลยนะคะ 🙇‍♀️", actions: [] });
    }
    if (/^(ตะกร้า|ตะกร้าสินค้า|ตะกร้าของฉัน|ดูตะกร้า|เช็คตะกร้า|รถเข็น)(ครับ|คับ|คัฟ|ค่ะ|คะ|จ้า|จ้ะ|ของฉัน)?$/i.test(cleanMsg)) {
        if (cartItems.length === 0) {
            return res.status(200).json({ success: true, reply: "ตะกร้าสินค้าของคุณยังว่างเปล่าค่ะ สนใจดูสินค้าหมวดหมู่ไหนไหมคะ? 😊", actions: [] });
        }
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return res.status(200).json({ 
            success: true, 
            reply: `ในตะกร้าของคุณมีสินค้า ${cartItems.length} รายการ ยอดรวม ${total} บาทค่ะ\nต้องการชำระเงินเลยไหมคะ?`, 
            actions: [{ type: 'show_inline_cart_checkout' }] 
        });
    }

    // ─── Step 2.1b: Category Name Interceptor (bypass LLM) ───────────────────
    // ถ้า user พิมพ์ชื่อหมวดหมู่ตรงๆ → ดึงสินค้าเลย ไม่ส่ง LLM (LLM มักไม่เรียก tool ในกรณีนี้)
    const KNOWN_CATEGORIES = {
        'เครื่องดื่ม': '🥤', 'อาหารแห้งและเครื่องปรุง': '🌾',
        'ขนมขบเคี้ยว': '🍿', 'ของใช้ส่วนตัว': '🧴',
        'ผลิตภัณฑ์ทำความสะอาด': '🧹', 'ยาสามัญประจำบ้าน': '💊',
        'สินค้าเบ็ดเตล็ด': '🛍️', 'ของสดและอื่นๆ': '🥬',
    };
    const msgTrimmed = message.trim();
    if (KNOWN_CATEGORIES[msgTrimmed]) {
        const icon = KNOWN_CATEGORIES[msgTrimmed];
        const catResult = await toolGetProductsByCategory(null, msgTrimmed);
        if (catResult.found && catResult.products?.length > 0) {
            const lines = catResult.products.map(p => {
                const mainVariant = p.variants?.[0];
                const priceStr = mainVariant ? ` – ราคา ${mainVariant.price} บาท` : '';
                const stockStr = mainVariant ? ` (มีสินค้า ${mainVariant.stock_quantity} ${mainVariant.unit || 'ชิ้น'})` : '';
                return `- ${p.name}${priceStr}${stockStr}`;
            });
            const reply = `${icon} สินค้าในหมวด **${msgTrimmed}** มีดังนี้ค่ะ:\n\n${lines.join('\n')}\n\nต้องการเพิ่มสินค้าใดลงตะกร้าบอกได้เลยค่ะ!`;
            return res.status(200).json({ success: true, reply, actions: [] });
        }
    }

    // ─── Step 2.2: Checkout Flow Interceptors ───
    if (cleanMsg.startsWith("เลือกที่อยู่จัดส่งนี้:")) {
        // Parse Address ID from message e.g. "เลือกที่อยู่จัดส่งนี้: ... (ID:X)"
        const match = cleanMsg.match(/\(id:(\d+)\)/);
        if (match && match[1]) {
            const addressId = parseInt(match[1]);
            return res.status(200).json({
                 success: true, 
                 reply: "เลือกที่อยู่เรียบร้อยแล้วค่ะ ✅\nกรุณาเลือกวิธีการชำระเงินเพื่อยืนยันคำสั่งซื้อนะคะ", 
                 actions: [
                     { type: 'set_checkout_address', address_id: addressId },
                     { type: 'show_payment_selection', address_id: addressId }
                 ] 
            });
        }
    } else if (cleanMsg.includes("ที่อยู่เริ่มต้น") || cleanMsg.includes("ที่อยู่เดิม")) {
        // Fetch default/first address for the user
        const userId = req.user?.id;
        if (userId) {
            try {
                const { rows } = await db.query(`SELECT address_id FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, address_id DESC LIMIT 1`, [userId]);
                if (rows.length > 0) {
                    const addressId = rows[0].address_id;
                    return res.status(200).json({
                         success: true, 
                         reply: "ใช้ที่อยู่เริ่มต้นเรียบร้อยแล้วค่ะ ✅\nกรุณาเลือกวิธีการชำระเงินเพื่อยืนยันคำสั่งซื้อนะคะ", 
                         actions: [
                             { type: 'set_checkout_address', address_id: addressId },
                             { type: 'show_payment_selection', address_id: addressId }
                         ] 
                    });
                }
            } catch (e) {
                console.error("Error fetching default address:", e);
            }
        }
        return res.status(200).json({ success: true, reply: "ระบบไม่พบที่อยู่เริ่มต้นของคุณค่ะ กรุณากดเลือกที่อยู่จากปุ่มด้านบน หรือเพิ่มที่อยู่ใหม่นะคะ", actions: [] });
    }
    
    // Check if user confirmed payment method
    if (cleanMsg === "ยืนยันสั่งซื้อด้วยการจ่ายผ่าน promptpay" || cleanMsg === "ยืนยันสั่งซื้อด้วยรูปแบบเก็บเงินปลายทาง (cod)") {
        const checkoutAddressId = req.body.checkoutAddressId;
        if (!checkoutAddressId) {
            return res.status(200).json({ success: true, reply: "กรุณาระบุที่อยู่จัดส่งก่อนเลือกวิธีชำระเงินนะคะ ลองพิมพ์ 'ชำระเงิน' ใหม่อีกครั้งค่ะ", actions: [] });
        }
        
        const paymentMethod = cleanMsg.includes("promptpay") ? "qr" : "cod";
        const actionsOut = [];
        
        // Execute checkout tool directly instead of going through LLM
        const result = await toolCheckoutOrderInChatbot(req.user?.id, cartItems, checkoutAddressId, paymentMethod, actionsOut);
        
        if (!result.success) {
            return res.status(200).json({ success: true, reply: result.message, actions: actionsOut });
        }
        
        return res.status(200).json({ success: true, reply: result.message, actions: actionsOut });
    }
    // ────────────────────────────────────────────────────────


    const history = Array.isArray(conversationHistory)
        ? conversationHistory
              .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
              .slice(-6)
        : [];

    try {
        const user = req.user || null;
        const systemPrompt = buildSystemPrompt(user ? { name: user.full_name || user.phone, phone: user.phone } : null, cartItems);
        const messages = [...history, { role: "user", content: message.trim() }];

        const actionsOut = [];
        const executeTool = makeExecuteTool(user?.id, actionsOut, cartItems);

        const { reply } = await chatWithTools(messages, systemPrompt, TOOLS, executeTool);

        return res.status(200).json({ success: true, reply, actions: actionsOut });
    } catch (err) {
        console.error("Chatbot error:", err.message);
        return res.status(500).json({
            success: false,
            message: "ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
            error: err.message,
        });
    }
};

module.exports = { sendMessage };
