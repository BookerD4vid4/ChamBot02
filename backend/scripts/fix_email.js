/**
 * fix_email.js — ลบ email column จาก users table, เพิ่ม address column ถ้าไม่มี
 * node scripts/fix_email.js
 */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
    const client = await pool.connect();
    try {
        // เพิ่ม address column (ถ้ายังไม่มี)
        await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address TEXT`);
        console.log("✓ address column พร้อมใช้");

        // ลบ email column (ถ้ามี)
        const { rows } = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='users' AND column_name='email'
        `);
        if (rows.length > 0) {
            await client.query(`ALTER TABLE public.users DROP COLUMN email`);
            console.log("✓ ลบ email column แล้ว");
        } else {
            console.log("ℹ email column ไม่มีใน DB อยู่แล้ว");
        }

        console.log("\n🎉 Database อัปเดตเรียบร้อย!");
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
