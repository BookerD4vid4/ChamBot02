/**
 * setup_new_db.js
 * ─────────────────────────────────────────────────────────────────
 * Full database setup สำหรับ Chambot Store
 * รัน: node scripts/setup_new_db.js
 * ─────────────────────────────────────────────────────────────────
 */
require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function run() {
    const client = await pool.connect();
    try {
        console.log("🔌 เชื่อมต่อ database สำเร็จ\n");

        // ══════════════════════════════════════════════════════════
        // SECTION 1: SCHEMA (Extensions + Enums + Tables + Views)
        // ══════════════════════════════════════════════════════════
        console.log("📐 [1/4] สร้าง Schema...");
        const setupSql = fs.readFileSync(path.join(__dirname, "../SETUP.sql"), "utf-8");
        await client.query(setupSql);
        console.log("   ✓ Tables, Views, Indexes สร้างแล้ว\n");

        // ══════════════════════════════════════════════════════════
        // SECTION 2: ADMIN USER
        // ══════════════════════════════════════════════════════════
        console.log("👤 [2/4] สร้าง Admin + Users...");
        await client.query(`
            INSERT INTO public.users (phone_number, full_name, role) VALUES
              ('0800000001', 'Admin Chambot',    'admin'),
              ('0812345602', 'สมชาย ใจดี',       'customer'),
              ('0812345603', 'สมศักดิ์ รักไทย',  'customer'),
              ('0812345604', 'มาลี สวนงาม',      'customer'),
              ('0812345605', 'เกียรติ ศรีชัย',   'customer')
            ON CONFLICT (phone_number) DO NOTHING;
        `);

        await client.query(`
            INSERT INTO public.user_addresses (user_id, recipient_name, address_line, province, postal_code)
            SELECT u.id, u.full_name, a.addr, a.prov, a.zip
            FROM (VALUES
              ('0812345602','123 ถ.พระราม 9','กรุงเทพมหานคร','10310'),
              ('0812345603','45 ถ.นิมมานเหมินท์','เชียงใหม่','50200'),
              ('0812345604','99 ถ.สุขุมวิท','กรุงเทพมหานคร','10110'),
              ('0812345605','77 ม.3 ต.นาเกลือ','ชลบุรี','20150')
            ) AS a(phone, addr, prov, zip)
            JOIN public.users u ON u.phone_number = a.phone
            WHERE NOT EXISTS (SELECT 1 FROM public.user_addresses ua WHERE ua.user_id = u.id);
        `);
        console.log("   ✓ 1 admin + 4 customers สร้างแล้ว\n");

        // ══════════════════════════════════════════════════════════
        // SECTION 3: 8 CATEGORIES + PRODUCTS
        // ══════════════════════════════════════════════════════════
        console.log("📂 [3/4] สร้างหมวดหมู่ 8 หมวด + สินค้า...");

        // 3.1 Insert categories
        const categories = [
            "เครื่องดื่ม",
            "อาหารแห้งและเครื่องปรุง",
            "ขนมขบเคี้ยว",
            "ของใช้ส่วนตัว",
            "ผลิตภัณฑ์ทำความสะอาด",
            "ยาสามัญประจำบ้าน",
            "สินค้าเบ็ดเตล็ด",
            "ของสดและอื่นๆ",
        ];
        for (const name of categories) {
            await client.query(
                "INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
                [name]
            );
        }

        // 3.2 Get category IDs
        const { rows: catRows } = await client.query(
            "SELECT category_id, name FROM categories WHERE name = ANY($1)", [categories]
        );
        const catId = Object.fromEntries(catRows.map(r => [r.name, r.category_id]));

        // 3.3 Products: [catName, name, description, slug, sku, price, stock, unit]
        const products = [
            // เครื่องดื่ม
            ["เครื่องดื่ม",               "น้ำดื่มบรรจุขวด 1.5L",         "น้ำดื่มบริสุทธิ์ขนาด 1.5 ลิตร",                "water-15l",             "DRK-WATER-1.5L",  12.00,  200, "ขวด"],
            ["เครื่องดื่ม",               "น้ำอัดลม โค้ก 325ml",           "Coca-Cola แบบกระป๋อง",                          "coke-325ml",            "DRK-COKE-325",    20.00,  150, "กระป๋อง"],
            ["เครื่องดื่ม",               "กาแฟสำเร็จรูป 3in1",             "กาแฟ 3in1 แบบซอง ยี่ห้อเนสกาแฟ",               "coffee-3in1",           "DRK-COFFEE-3IN1", 15.00,  300, "ซอง"],
            ["เครื่องดื่ม",               "ชาเขียวพร้อมดื่ม 500ml",        "ชาเขียวใบมะตูม ความหวานน้อย",                   "greentea-500ml",        "DRK-TEA-GRN-500", 25.00,  120, "ขวด"],
            ["เครื่องดื่ม",               "นมจืดUHT 200ml",                 "นม UHT ไขมันเต็ม ยี่ห้อโฟร์โมสต์",             "milk-uht-200ml",        "DRK-MILK-UHT",    20.00,  180, "กล่อง"],
            // อาหารแห้งและเครื่องปรุง
            ["อาหารแห้งและเครื่องปรุง",  "ข้าวหอมมะลิ 5kg",               "ข้าวหอมมะลิ 100% จากทุ่งกุลาร้องไห้",          "jasmine-rice-5kg",      "FOOD-RICE-5KG",  185.00,   80, "ถุง"],
            ["อาหารแห้งและเครื่องปรุง",  "น้ำปลาทิพรส 700ml",              "น้ำปลาแท้ พรีเมี่ยมเกรด",                       "fish-sauce-700ml",      "FOOD-FISH-700",   55.00,  100, "ขวด"],
            ["อาหารแห้งและเครื่องปรุง",  "ซอสมะเขือเทศ 300g",             "ซอสมะเขือเทศไฮนซ์",                             "ketchup-300g",          "FOOD-KETCH-300",  65.00,   90, "ขวด"],
            ["อาหารแห้งและเครื่องปรุง",  "บะหมี่กึ่งสำเร็จรูป มาม่า",      "บะหมี่กึ่งสำเร็จรูป รสต้มยำกุ้ง",              "mama-noodle",           "FOOD-MAMA-TOMYUM", 7.00, 500, "ซอง"],
            // ขนมขบเคี้ยว
            ["ขนมขบเคี้ยว",              "มันฝรั่งทอดกรอบ เลย์ 44g",       "เลย์รสออริจินัล ซอง 44g",                        "lays-44g",              "SNK-LAYS-44G",    30.00,  200, "ซอง"],
            ["ขนมขบเคี้ยว",              "คุกกี้ช็อคโกแลตชิป 200g",        "คุกกี้ช็อคโกแลตชิปอร่อยกรอบ",                  "choc-chip-cookie",      "SNK-COOKIE-200",  89.00,   80, "กล่อง"],
            ["ขนมขบเคี้ยว",              "ป๊อปคอร์น เนย 30g",              "ป๊อปคอร์นรสเนยพร้อมทาน",                        "popcorn-butter-30g",    "SNK-POPCORN-30",  25.00,  100, "ซอง"],
            // ของใช้ส่วนตัว
            ["ของใช้ส่วนตัว",            "แชมพูสระผม 200ml",               "แชมพูสูตรลดผมร่วง",                              "shampoo-200ml",         "CARE-SHAMP-200",  89.00,   60, "ขวด"],
            ["ของใช้ส่วนตัว",            "สบู่ก้อนดูฟ 75g",                "สบู่อาบน้ำสูตรมอยส์เจอร์",                      "dove-soap-75g",         "CARE-SOAP-75G",   35.00,  100, "ก้อน"],
            ["ของใช้ส่วนตัว",            "ยาสีฟัน โคลเกต 150g",           "ยาสีฟันฟลูออไรด์ป้องกันฟันผุ",                 "colgate-150g",          "CARE-TPASTE-150", 59.00,   80, "หลอด"],
            ["ของใช้ส่วนตัว",            "ผ้าอนามัย Charm 10 ชิ้น",       "ผ้าอนามัยแบบมีปีก Ultra Thin",                   "charm-pad-10pcs",       "CARE-PAD-10",     55.00,   70, "แพ็ค"],
            // ผลิตภัณฑ์ทำความสะอาด
            ["ผลิตภัณฑ์ทำความสะอาด",    "น้ำยาล้างจาน ซันไลท์ 500ml",   "น้ำยาล้างจานสูตรเข้มข้น",                        "sunlight-500ml",        "CLEAN-DISH-500",  49.00,   80, "ขวด"],
            ["ผลิตภัณฑ์ทำความสะอาด",    "ผงซักฟอก ไทด์ 900g",            "ผงซักฟอกสูตรหอมสดชื่น",                          "tide-900g",             "CLEAN-TIDE-900", 125.00,   50, "ถุง"],
            ["ผลิตภัณฑ์ทำความสะอาด",    "น้ำยาปรับผ้านุ่ม Comfort 550ml","น้ำยาปรับผ้านุ่มกลิ่นซันไรส์ซิ่ง",             "comfort-550ml",         "CLEAN-SOFT-550",  79.00,   60, "ขวด"],
            // ยาสามัญประจำบ้าน
            ["ยาสามัญประจำบ้าน",         "ยาพาราเซตามอล 500mg 10 เม็ด",   "ยาแก้ปวดลดไข้พาราเซตามอล",                     "para-500mg",            "MED-PARA-10",     15.00,  200, "แผง"],
            ["ยาสามัญประจำบ้าน",         "ยาแก้แพ้ Loratadine 10mg",      "ยาแก้แพ้ ลดน้ำมูก ไม่ง่วงนอน",                  "loratadine-10mg",       "MED-LORA-10",     35.00,  100, "แผง"],
            ["ยาสามัญประจำบ้าน",         "ยาธาตุน้ำแดง 120ml",            "ยาธาตุช่วยย่อยอาหาร บรรเทาท้องอืด",             "red-tonic-120ml",       "MED-TONIC-120",   45.00,   80, "ขวด"],
            // สินค้าเบ็ดเตล็ด
            ["สินค้าเบ็ดเตล็ด",          "ถุงขยะดำ 30L (แพ็ค 30 ใบ)",    "ถุงขยะสีดำ HDPE ขนาด 30 ลิตร",                  "trash-bag-30l",         "MISC-TRSH-30L",   59.00,   80, "แพ็ค"],
            ["สินค้าเบ็ดเตล็ด",          "เทปกาวใส 18mm x 15m",           "เทปกาวใสคุณภาพดี",                               "tape-clear-18mm",       "MISC-TAPE-18",    25.00,  100, "ม้วน"],
            ["สินค้าเบ็ดเตล็ด",          "หลอดไฟ LED 9W",                  "หลอดไฟ LED ประหยัดพลังงาน ขั้ว E27",            "led-bulb-9w",           "MISC-LED-9W",     89.00,   50, "ดวง"],
            // ของสดและอื่นๆ
            ["ของสดและอื่นๆ",            "ไข่ไก่ เบอร์ 2 (แผง 30 ฟอง)",  "ไข่ไก่สดคุณภาพดี เบอร์ 2",                      "egg-30pcs",             "FRESH-EGG-30",   135.00,   40, "แผง"],
            ["ของสดและอื่นๆ",            "กล้วยหอม 1 หวี",                 "กล้วยหอมทองสุกพอดี",                            "banana-1bunch",         "FRESH-BANA-1",    45.00,   30, "หวี"],
            ["ของสดและอื่นๆ",            "ขนมปังแซนด์วิช 12 แผ่น",        "ขนมปังโฮลวีท 12 แผ่นต่อถุง",                    "sandwich-bread-12",     "FRESH-BREAD-12",  55.00,   25, "ถุง"],
        ];

        let productCount = 0;
        for (const [cat, name, descr, slug, sku, price, stock, unit] of products) {
            const cid = catId[cat];
            // Insert product
            const { rows: prodRes } = await client.query(`
                INSERT INTO products (category_id, name, description, slug, is_active)
                VALUES ($1,$2,$3,$4,true)
                ON CONFLICT (slug) DO UPDATE SET category_id=$1, name=$2, description=$3
                RETURNING product_id
            `, [cid, name, descr, slug]);
            const pid = prodRes[0].product_id;
            // Insert variant
            await client.query(`
                INSERT INTO product_variants (product_id, sku, price, stock_quantity, unit, is_main, is_active)
                VALUES ($1,$2,$3,$4,$5,true,true)
                ON CONFLICT (sku) DO UPDATE SET price=$3, stock_quantity=$4, unit=$5
            `, [pid, sku, price, stock, unit]);
            productCount++;
        }
        console.log(`   ✓ ${categories.length} หมวดหมู่ + ${productCount} สินค้า (พร้อม variants)\n`);

        // ══════════════════════════════════════════════════════════
        // SECTION 4: SAMPLE ORDERS (5 orders)
        // ══════════════════════════════════════════════════════════
        console.log("🛒 [4/4] สร้าง Sample Orders...");
        await client.query(`
            DO $$
            DECLARE
                u2 int; u3 int; u4 int; u5 int;
                a2 int; a3 int; a4 int; a5 int;
                v1 int; v6 int; v10 int; v13 int; v20 int;
                o1 int; o2 int; o3 int; o4 int; o5 int;
            BEGIN
                SELECT id INTO u2 FROM users WHERE phone_number='0812345602';
                SELECT id INTO u3 FROM users WHERE phone_number='0812345603';
                SELECT id INTO u4 FROM users WHERE phone_number='0812345604';
                SELECT id INTO u5 FROM users WHERE phone_number='0812345605';

                SELECT address_id INTO a2 FROM user_addresses WHERE user_id=u2 LIMIT 1;
                SELECT address_id INTO a3 FROM user_addresses WHERE user_id=u3 LIMIT 1;
                SELECT address_id INTO a4 FROM user_addresses WHERE user_id=u4 LIMIT 1;
                SELECT address_id INTO a5 FROM user_addresses WHERE user_id=u5 LIMIT 1;

                SELECT variant_id INTO v1  FROM product_variants WHERE sku='DRK-WATER-1.5L';
                SELECT variant_id INTO v6  FROM product_variants WHERE sku='FOOD-RICE-5KG';
                SELECT variant_id INTO v10 FROM product_variants WHERE sku='SNK-LAYS-44G';
                SELECT variant_id INTO v13 FROM product_variants WHERE sku='CARE-SHAMP-200';
                SELECT variant_id INTO v20 FROM product_variants WHERE sku='MED-PARA-10';

                -- Order 1: delivered
                INSERT INTO orders(user_id,total_amount,status,payment_status,created_at,updated_at)
                VALUES(u2,372.00,'delivered','paid',NOW()-'30 days'::interval,NOW()-'28 days'::interval)
                RETURNING order_id INTO o1;
                INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o1,v1,12.00,2),(o1,v6,185.00,2);
                INSERT INTO payments(order_id,method,status,paid_at) VALUES(o1,'qr','paid',NOW()-'30 days'::interval);
                INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
                VALUES(o1,a2,'delivered','TH-001',NOW()-'29 days'::interval);

                -- Order 2: shipped
                INSERT INTO orders(user_id,total_amount,status,payment_status,created_at,updated_at)
                VALUES(u3,149.00,'shipped','paid',NOW()-'14 days'::interval,NOW()-'13 days'::interval)
                RETURNING order_id INTO o2;
                INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o2,v10,30.00,3),(o2,v13,89.00,1);
                INSERT INTO payments(order_id,method,status,paid_at) VALUES(o2,'qr','paid',NOW()-'14 days'::interval);
                INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
                VALUES(o2,a3,'shipped','KEX-002',NOW()-'13 days'::interval);

                -- Order 3: pending COD
                INSERT INTO orders(user_id,total_amount,status,payment_status,created_at,updated_at)
                VALUES(u4,185.00,'pending','pending',NOW()-'3 days'::interval,NOW()-'3 days'::interval)
                RETURNING order_id INTO o3;
                INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o3,v6,185.00,1);
                INSERT INTO payments(order_id,method,status) VALUES(o3,'cod','pending');

                -- Order 4: confirmed
                INSERT INTO orders(user_id,total_amount,status,payment_status,created_at,updated_at)
                VALUES(u5,45.00,'confirmed','paid',NOW()-'7 days'::interval,NOW()-'7 days'::interval)
                RETURNING order_id INTO o4;
                INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o4,v20,15.00,3);
                INSERT INTO payments(order_id,method,status,paid_at) VALUES(o4,'qr','paid',NOW()-'7 days'::interval);

                -- Order 5: delivered
                INSERT INTO orders(user_id,total_amount,status,payment_status,created_at,updated_at)
                VALUES(u2,89.00,'delivered','paid',NOW()-'60 days'::interval,NOW()-'58 days'::interval)
                RETURNING order_id INTO o5;
                INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o5,v13,89.00,1);
                INSERT INTO payments(order_id,method,status,paid_at) VALUES(o5,'qr','paid',NOW()-'60 days'::interval);
                INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
                VALUES(o5,a2,'delivered','JT-005',NOW()-'59 days'::interval);

                RAISE NOTICE '✅ 5 sample orders inserted';
            END $$;
        `);
        console.log("   ✓ 5 sample orders สร้างแล้ว\n");

        // ── Summary ──────────────────────────────────────────────
        const { rows: summary } = await client.query(`
            SELECT c.name AS category, COUNT(p.product_id) AS products
            FROM categories c LEFT JOIN products p ON p.category_id = c.category_id
            GROUP BY c.category_id, c.name ORDER BY c.name
        `);
        console.log("📊 สรุปหมวดหมู่สินค้า:");
        summary.forEach(r => console.log(`   ${r.category.padEnd(35)} ${r.products} สินค้า`));

        console.log("\n🎉 Setup เสร็จสมบูรณ์! Database พร้อมใช้งาน");
    } catch (err) {
        console.error("\n❌ Error:", err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
