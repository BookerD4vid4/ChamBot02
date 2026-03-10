# Chambot E-Commerce System

ระบบ E-Commerce ครบวงจร พร้อม AI Chatbot ผู้ช่วยช้อปปิ้ง, Admin Dashboard, และระบบชำระเงิน
รองรับทั้ง Admin และลูกค้า (Customer Storefront) เชื่อมต่อกับ Supabase PostgreSQL + pgvector

---

## คุณสมบัติหลัก

| Feature | รายละเอียด |
|---------|-----------|
| **Admin Dashboard** | Dark Theme, กราฟรายได้, สถิติเรียลไทม์ |
| **Product & Stock Management** | จัดการสินค้า, variant, สต็อก, แจ้งเตือนสินค้าใกล้หมด |
| **Order Management** | Pipeline สถานะ pending → shipping → completed / cancelled |
| **Member Management** | ระงับ/เปิดบัญชี, เพิ่ม admin ด้วย Dual OTP |
| **Customer Storefront** | หน้าร้านค้า, ตะกร้า, checkout, ติดตามพัสดุ |
| **Customer Auth** | OTP login ผ่านเบอร์โทร |
| **AI Chatbot** | Typhoon 2.5 LLM + Tool Calling: ค้นหาสินค้า, เพิ่มตะกร้า, checkout ผ่านแชท |
| **Semantic Search** | pgvector + Gemini Embedding (`gemini-embedding-001`, 768 มิติ) |
| **Payment** | PromptPay QR (Omise) + เก็บเงินปลายทาง (COD) |

---

## การติดตั้ง (Setup)

### 1. เตรียมฐานข้อมูล (Supabase)

1. สมัครที่ [supabase.com](https://supabase.com/) แล้วสร้าง Project ใหม่
2. ไปที่ **SQL Editor → New Query**
3. เปิดไฟล์ `backend/SETUP.sql` → คัดลอกทั้งหมด → วาง → กด **Run**

> ไฟล์เดียวครอบคลุมทุกอย่าง: Extensions, ENUMs, Tables (14 ตาราง), Indexes, Views, Functions

### 2. ตั้งค่า Backend

สร้างไฟล์ `backend/.env`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

JWT_SECRET=your_random_secret_key_here
CUSTOMER_JWT_SECRET=your_customer_secret_here

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

TYPHOON_API_KEY=your_typhoon_api_key_here
TYPHOON_API_URL=https://api.opentyphoon.ai/v1

OMISE_PUBLIC_KEY=pkey_test_xxx
OMISE_SECRET_KEY=skey_test_xxx
OMISE_WEBHOOK_SECRET=

DEMO_MODE=true
```

> `DATABASE_URL` หาได้จาก Supabase → **Settings → Database → Connection String → Transaction pooler**
> `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/)
> `TYPHOON_API_KEY` — [opentyphoon.ai](https://opentyphoon.ai/)
> `OMISE_SECRET_KEY` — [dashboard.omise.co](https://dashboard.omise.co/) (ใช้ test key ก่อน)

ติดตั้งและรัน:

```bash
cd backend
npm install
npm run dev
```

### 3. ตั้งค่า Frontend

```bash
cd frontend
npm install
npm start
```

---

## ข้อมูลตัวอย่าง (Optional)

หากต้องการ seed data สำหรับทดสอบ ให้รัน `backend/SAMPLE_ORDERS.sql` ใน SQL Editor **ต่อจาก** SETUP.sql

---

## โครงสร้างไฟล์ SQL

| ไฟล์ | สถานะ | คำอธิบาย |
|------|-------|-----------|
| `SETUP.sql` | ✅ ใช้งาน | **รันไฟล์เดียวนี้เพื่อ setup ทั้งหมด** |
| `SAMPLE_ORDERS.sql` | ✅ Optional | Seed data 10 orders สำหรับทดสอบ |

---

## สถานะ Order

| DB Value | ความหมาย | ขั้นตอนถัดไป |
|----------|---------|-------------|
| `pending` | รอยืนยัน | → shipping หรือ cancelled |
| `shipping` | กำลังจัดส่ง | → completed หรือ cancelled |
| `completed` | จัดส่งสำเร็จ | (สิ้นสุด) |
| `cancelled` | ยกเลิกออร์เดอร์ | (สิ้นสุด) |

---

## ENV Variables สำคัญ

| Variable | ต้องการ | หมายเหตุ |
|----------|---------|---------|
| `DATABASE_URL` | ✅ | Supabase Transaction Pooler (port 6543) |
| `JWT_SECRET` | ✅ | Admin/Member token |
| `CUSTOMER_JWT_SECRET` | ✅ | Customer token (ควรเปลี่ยนก่อน production) |
| `GEMINI_API_KEY` | ✅ | สำหรับ product embedding + search |
| `TYPHOON_API_KEY` | ✅ | สำหรับ AI Chatbot |
| `OMISE_SECRET_KEY` | ⚠️ | ต้องใส่ key จริงก่อน go live |
| `DEMO_MODE` | — | `true` = PromptPay ข้ามการตรวจสอบจริง |
