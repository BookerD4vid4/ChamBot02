-- =====================================================================
-- CHAMBOT — SAMPLE ORDERS SEED DATA (10 คำสั่งซื้อตัวอย่าง)
-- Compatible with SETUP.sql
-- order_status ENUM:  pending | shipping | completed | cancelled
-- payment_status ENUM: pending | paid | failed | refunded
-- shipment_status ENUM: preparing | shipped | delivered | returned
-- =====================================================================

-- ── 1. Users ─────────────────────────────────────────────────────────
-- user_role ENUM: 'admin' | 'customer'
INSERT INTO public.users (phone_number, full_name, role) VALUES
  ('0812345601', 'Admin Chambot',    'admin'),
  ('0812345602', 'สมชาย ใจดี',       'customer'),
  ('0812345603', 'สมศักดิ์ รักไทย',   'customer'),
  ('0812345604', 'มาลี สวนงาม',      'customer'),
  ('0812345605', 'เกียรติ ศรีชัย',    'customer'),
  ('0812345606', 'วิภา พาวเวอร์',     'customer'),
  ('0812345607', 'อุดม โชคดี',       'customer'),
  ('0812345608', 'พัชรา เขียวชอุ่ม', 'customer'),
  ('0812345609', 'ณิชา แครฟท์',      'customer'),
  ('0812345610', 'ตะวัน ฟ้าใส',      'customer')
ON CONFLICT (phone_number) DO NOTHING;

-- ── 2. Categories ────────────────────────────────────────────────────
INSERT INTO public.categories (name) VALUES
  ('กาแฟเมล็ด'), ('ชาและสมุนไพร'), ('อุปกรณ์ชงกาแฟ'),
  ('แก้วและภาชนะ'), ('เมล็ดพันธุ์เกษตร'), ('ปุ๋ยอินทรีย์'),
  ('เครื่องจักรแปรรูป'), ('ผลิตภัณฑ์แปรรูป'), ('คอร์สอบรม'), ('แพ็คเกจท่องเที่ยว')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Products ───────────────────────────────────────────────────────
INSERT INTO public.products (category_id, name, description, is_active, slug)
SELECT c.category_id, p.pname, p.pdescr, true, p.slug
FROM (VALUES
  ('กาแฟเมล็ด',        'เมล็ดกาแฟอาราบิก้า คั่วกลาง', 'Premium Arabica จากภาคเหนือ',  'arabica-medium'),
  ('ชาและสมุนไพร',     'ชาเขียวออร์แกนิค',            'ใบชาสายพันธุ์พิเศษ',            'organic-greentea'),
  ('อุปกรณ์ชงกาแฟ',   'Drip Kettle 600ml',            'กาน้ำสำหรับ Pour Over',         'drip-kettle-600'),
  ('แก้วและภาชนะ',     'แก้วเซรามิคทำมือ',             'เคลือบสีฟ้าไม่ซ้ำใคร',          'handmade-ceramic-mug'),
  ('เมล็ดพันธุ์เกษตร', 'เมล็ดพันธุ์กัญชงคุณภาพ',      'เมล็ดพันธุ์รับรอง',             'hemp-seed'),
  ('ปุ๋ยอินทรีย์',     'ปุ๋ยหมักชีวภาพ 5kg',           'สูตรเข้มข้นจุลินทรีย์',         'organic-fertilizer-5kg'),
  ('เครื่องจักรแปรรูป','เครื่องสีข้าวพกพา',            'กำลังไฟ 220V',                  'portable-rice-mill'),
  ('ผลิตภัณฑ์แปรรูป',  'แยมสตรอว์เบอร์รี่ดอย',        'ไม่มีน้ำตาลเพิ่ม',              'strawberry-jam-doi'),
  ('คอร์สอบรม',        'Basic Barista Course',          'อบรม 1 วัน เต็ม',              'basic-barista-course'),
  ('แพ็คเกจท่องเที่ยว','One Day Farm Trip',             'ทัวร์ไร่กาแฟ 1 วัน',           'one-day-farm-trip')
) AS p(cat, pname, pdescr, slug)
JOIN public.categories c ON c.name = p.cat
ON CONFLICT (slug) DO NOTHING;

-- ── 4. Product Variants ───────────────────────────────────────────────
INSERT INTO public.product_variants (product_id, sku, price, stock_quantity, low_stock_threshold, is_main)
SELECT p.product_id, v.sku, v.price, v.stock, v.threshold, true
FROM (VALUES
  ('arabica-medium',       'COFFEE-AR-250G', 350.00,  50, 10),
  ('organic-greentea',     'TEA-GRN-50G',    180.00,  15,  5),
  ('drip-kettle-600',      'TOOL-KTL-600',  1200.00,   8,  3),
  ('handmade-ceramic-mug', 'WARE-MUG-HND',   450.00,  20,  5),
  ('hemp-seed',            'SEED-HEM-100G',  890.00, 100, 20),
  ('organic-fertilizer-5kg','FERT-ORG-5KG', 250.00,   4, 10),
  ('portable-rice-mill',   'MACH-RICE-POR',15500.00,   2,  1),
  ('strawberry-jam-doi',   'FOOD-JAM-STW',   120.00,  45, 10),
  ('basic-barista-course', 'EDU-BAR-BASIC', 2500.00,  12,  5),
  ('one-day-farm-trip',    'TRP-FARM-1D',   1500.00,  20,  5)
) AS v(slug, sku, price, stock, threshold)
JOIN public.products p ON p.slug = v.slug
ON CONFLICT (sku) DO NOTHING;

-- ── 5. User Addresses ─────────────────────────────────────────────────
INSERT INTO public.user_addresses (user_id, recipient_name, address_line, province, postal_code)
SELECT u.id, u.full_name, a.addr, a.prov, a.zip
FROM (VALUES
  ('0812345602', '123 ถ.พระราม 9 แขวงห้วยขวาง', 'กรุงเทพมหานคร', '10310'),
  ('0812345603', '45/1 ถ.นิมมานเหมินท์',          'เชียงใหม่',      '50200'),
  ('0812345604', '99 ถ.สุขุมวิท ซ.11',             'กรุงเทพมหานคร', '10110'),
  ('0812345605', '77 ม.3 ต.นาเกลือ',               'ชลบุรี',         '20150'),
  ('0812345606', '55 ถ.กลางเมือง',                 'ขอนแก่น',       '40000'),
  ('0812345607', '12 ถ.ข้าวสาร แขวงบวรนิเวศ',      'กรุงเทพมหานคร', '10200'),
  ('0812345608', '88 ถ.วิชิตสงคราม',               'ภูเก็ต',         '83000'),
  ('0812345609', '22 ถ.มหาวิทยาลัย',               'พิษณุโลก',      '65000'),
  ('0812345610', '33 ถ.นครใน อ.เมือง',             'สงขลา',          '90000')
) AS a(phone, addr, prov, zip)
JOIN public.users u ON u.phone_number = a.phone
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_addresses ua WHERE ua.user_id = u.id
);

-- ── 6. MAIN: 10 Sample Orders (DO block to capture IDs) ──────────────
DO $$
DECLARE
  u2 int; u3 int; u4 int; u5 int; u6 int; u7 int; u8 int; u9 int; u10 int;
  v1 int; v2 int; v3 int; v4 int; v5 int; v6 int; v7 int; v8 int; v9 int; v10 int;
  a2 int; a3 int; a4 int; a5 int; a6 int; a7 int; a8 int; a9 int; a10 int;
  o1 int; o2 int; o3 int; o4 int; o5 int; o6 int; o7 int; o8 int; o9 int; o10 int;
BEGIN
  -- Lookup user IDs
  SELECT id INTO u2  FROM users WHERE phone_number='0812345602';
  SELECT id INTO u3  FROM users WHERE phone_number='0812345603';
  SELECT id INTO u4  FROM users WHERE phone_number='0812345604';
  SELECT id INTO u5  FROM users WHERE phone_number='0812345605';
  SELECT id INTO u6  FROM users WHERE phone_number='0812345606';
  SELECT id INTO u7  FROM users WHERE phone_number='0812345607';
  SELECT id INTO u8  FROM users WHERE phone_number='0812345608';
  SELECT id INTO u9  FROM users WHERE phone_number='0812345609';
  SELECT id INTO u10 FROM users WHERE phone_number='0812345610';

  -- Lookup variant IDs
  SELECT variant_id INTO v1  FROM product_variants WHERE sku='COFFEE-AR-250G';
  SELECT variant_id INTO v2  FROM product_variants WHERE sku='TEA-GRN-50G';
  SELECT variant_id INTO v3  FROM product_variants WHERE sku='TOOL-KTL-600';
  SELECT variant_id INTO v4  FROM product_variants WHERE sku='WARE-MUG-HND';
  SELECT variant_id INTO v5  FROM product_variants WHERE sku='SEED-HEM-100G';
  SELECT variant_id INTO v6  FROM product_variants WHERE sku='FERT-ORG-5KG';
  SELECT variant_id INTO v7  FROM product_variants WHERE sku='MACH-RICE-POR';
  SELECT variant_id INTO v8  FROM product_variants WHERE sku='FOOD-JAM-STW';
  SELECT variant_id INTO v9  FROM product_variants WHERE sku='EDU-BAR-BASIC';
  SELECT variant_id INTO v10 FROM product_variants WHERE sku='TRP-FARM-1D';

  -- Lookup address IDs
  SELECT address_id INTO a2  FROM user_addresses WHERE user_id=u2  LIMIT 1;
  SELECT address_id INTO a3  FROM user_addresses WHERE user_id=u3  LIMIT 1;
  SELECT address_id INTO a4  FROM user_addresses WHERE user_id=u4  LIMIT 1;
  SELECT address_id INTO a5  FROM user_addresses WHERE user_id=u5  LIMIT 1;
  SELECT address_id INTO a6  FROM user_addresses WHERE user_id=u6  LIMIT 1;
  SELECT address_id INTO a7  FROM user_addresses WHERE user_id=u7  LIMIT 1;
  SELECT address_id INTO a8  FROM user_addresses WHERE user_id=u8  LIMIT 1;
  SELECT address_id INTO a9  FROM user_addresses WHERE user_id=u9  LIMIT 1;
  SELECT address_id INTO a10 FROM user_addresses WHERE user_id=u10 LIMIT 1;

  -- ── ORDER 1: สมชาย — กาแฟ 2 ถุง → completed / paid (55 วันที่แล้ว)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u2, 700.00,'completed','paid', NOW()-'55 days'::interval, NOW()-'53 days'::interval)
    RETURNING order_id INTO o1;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o1,v1,350.00,2);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o1,'qr','paid', NOW()-'55 days'::interval);
  INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
    VALUES(o1,a2,'delivered','TH-001-SAMPLE', NOW()-'54 days'::interval);
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o1,'pending',  'system','Order created'),
    (o1,'shipping', 'admin', 'Dispatched via Thailand Post'),
    (o1,'completed','system','Parcel delivered');

  -- ── ORDER 2: สมศักดิ์ — ชาเขียว 1 กล่อง → shipping / paid (40 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u3, 180.00,'shipping','paid', NOW()-'40 days'::interval, NOW()-'38 days'::interval)
    RETURNING order_id INTO o2;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o2,v2,180.00,1);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o2,'qr','paid', NOW()-'40 days'::interval);
  INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
    VALUES(o2,a3,'shipped','KEX-002-SAMPLE', NOW()-'38 days'::interval);
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o2,'pending', 'system','Order created'),
    (o2,'shipping','admin', 'In transit via Kerry');

  -- ── ORDER 3: มาลี — Drip Kettle 1 → pending / paid (30 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u4, 1200.00,'pending','paid', NOW()-'30 days'::interval, NOW()-'29 days'::interval)
    RETURNING order_id INTO o3;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o3,v3,1200.00,1);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o3,'qr','paid', NOW()-'30 days'::interval);
  INSERT INTO shipments(order_id,address_id,status) VALUES(o3,a4,'preparing');
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o3,'pending','system','Order placed — QR payment received');

  -- ── ORDER 4: เกียรติ — แก้วเซรามิค 1 → pending / pending (COD, 25 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u5, 450.00,'pending','pending', NOW()-'25 days'::interval, NOW()-'25 days'::interval)
    RETURNING order_id INTO o4;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o4,v4,450.00,1);
  INSERT INTO payments(order_id,method,status) VALUES(o4,'cod','pending');
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o4,'pending','system','COD order — awaiting pickup');

  -- ── ORDER 5: วิภา — เมล็ดพันธุ์ 1 → completed / paid (20 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u6, 890.00,'completed','paid', NOW()-'20 days'::interval, NOW()-'17 days'::interval)
    RETURNING order_id INTO o5;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o5,v5,890.00,1);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o5,'qr','paid', NOW()-'20 days'::interval);
  INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
    VALUES(o5,a6,'delivered','JT-005-SAMPLE', NOW()-'19 days'::interval);
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o5,'pending',  'system','Order created'),
    (o5,'shipping', 'admin', 'Out for delivery'),
    (o5,'completed','system','Successfully delivered');

  -- ── ORDER 6: อุดม — ปุ๋ย 2 ถุง → pending / pending (COD, 15 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u7, 500.00,'pending','pending', NOW()-'15 days'::interval, NOW()-'15 days'::interval)
    RETURNING order_id INTO o6;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o6,v6,250.00,2);
  INSERT INTO payments(order_id,method,status) VALUES(o6,'cod','pending');
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o6,'pending','system','Waiting for COD confirmation');

  -- ── ORDER 7: พัชรา — เครื่องสีข้าว 1 → completed / paid (12 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u8, 15500.00,'completed','paid', NOW()-'12 days'::interval, NOW()-'9 days'::interval)
    RETURNING order_id INTO o7;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o7,v7,15500.00,1);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o7,'qr','paid', NOW()-'12 days'::interval);
  INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
    VALUES(o7,a8,'delivered','DHL-007-SAMPLE', NOW()-'11 days'::interval);
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o7,'pending',  'system','Large order placed'),
    (o7,'shipping', 'admin', 'Dispatched via DHL'),
    (o7,'completed','system','Signature obtained');

  -- ── ORDER 8: ณิชา — แยม 3 ขวด → shipping / paid (8 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u9, 360.00,'shipping','paid', NOW()-'8 days'::interval, NOW()-'7 days'::interval)
    RETURNING order_id INTO o8;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o8,v8,120.00,3);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o8,'qr','paid', NOW()-'8 days'::interval);
  INSERT INTO shipments(order_id,address_id,status,tracking_number,shipped_at)
    VALUES(o8,a9,'shipped','EE-008-SAMPLE', NOW()-'7 days'::interval);
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o8,'pending', 'system','Order placed'),
    (o8,'shipping','admin', 'In transit — EMS');

  -- ── ORDER 9: ตะวัน — Barista Course → cancelled / refunded (5 วัน)
  -- payment_status: 'refunded' (valid in SCHEMA enum)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u10, 2500.00,'cancelled','refunded', NOW()-'5 days'::interval, NOW()-'4 days'::interval)
    RETURNING order_id INTO o9;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o9,v9,2500.00,1);
  INSERT INTO payments(order_id,method,status) VALUES(o9,'qr','refunded');
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o9,'pending',  'system','Course booking created'),
    (o9,'cancelled','admin', 'Customer requested cancel — refund processed');

  -- ── ORDER 10: สมชาย — Farm Trip 2 ที่ → pending / paid (2 วัน)
  INSERT INTO orders (user_id,total_amount,status,payment_status,created_at,updated_at)
    VALUES (u2, 3000.00,'pending','paid', NOW()-'2 days'::interval, NOW()-'2 days'::interval)
    RETURNING order_id INTO o10;
  INSERT INTO order_items(order_id,variant_id,price,quantity) VALUES(o10,v10,1500.00,2);
  INSERT INTO payments(order_id,method,status,paid_at)
    VALUES(o10,'qr','paid', NOW()-'2 days'::interval);
  INSERT INTO shipments(order_id,address_id,status) VALUES(o10,a2,'preparing');
  INSERT INTO order_status_logs(order_id,status,changed_by,note) VALUES
    (o10,'pending','system','Trip reservation — QR payment received');

  -- ── 7. Inventory Transactions ─────────────────────────────────────
  -- transaction_type ENUM: 'purchase' | 'restock' | 'adjustment' | 'cancel'
  -- quantity_changed must be != 0 (CHECK constraint)
  INSERT INTO public.inventory_transactions
    (variant_id, transaction_type, quantity_changed, reference_order_id, notes)
  VALUES
    -- Purchases (negative — stock out)
    (v1, 'purchase', -2, o1,  'Order #1 – กาแฟ 2 ถุง'),
    (v2, 'purchase', -1, o2,  'Order #2 – ชาเขียว 1 กล่อง'),
    (v3, 'purchase', -1, o3,  'Order #3 – Drip Kettle'),
    (v4, 'purchase', -1, o4,  'Order #4 – แก้วเซรามิค'),
    (v5, 'purchase', -1, o5,  'Order #5 – เมล็ดพันธุ์'),
    (v6, 'purchase', -2, o6,  'Order #6 – ปุ๋ยหมัก 2 ถุง'),
    (v7, 'purchase', -1, o7,  'Order #7 – เครื่องสีข้าว'),
    (v8, 'purchase', -3, o8,  'Order #8 – แยม 3 ขวด'),
    (v10,'purchase', -2, o10, 'Order #10 – Farm Trip 2 ที่นั่ง'),
    -- Cancellation (positive — stock returned)
    (v9, 'cancel',  +1, o9,  'Order #9 cancelled — 1 course slot returned'),
    -- Restock (positive — stock in)
    (v1, 'restock', +50, NULL, 'Initial stock — กาแฟอาราบิก้า'),
    (v2, 'restock', +15, NULL, 'Initial stock — ชาเขียว'),
    (v6, 'restock', +10, NULL, 'New batch — ปุ๋ยหมัก'),
    (v9, 'restock', +12, NULL, 'Course slots added — Q1');

  RAISE NOTICE '✅ 10 sample orders inserted successfully!';
END $$;
