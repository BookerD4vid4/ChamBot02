const db = require("../config/supabaseClient");
const { signCustomerToken } = require("../middleware/customerAuth");

const OTP_TTL_MS = 5 * 60 * 1000; // 5 mins

// ─── POST /api/customer/auth/request-otp ─────────────────────────────────────
const requestOtp = async (req, res) => {
    const { phone } = req.body;
    if (!phone || !/^[0-9]{9,10}$/.test(phone.replace(/[-\s]/g, ""))) {
        return res.status(400).json({ success: false, message: "กรุณากรอกเบอร์โทรที่ถูกต้อง" });
    }

    const DEMO_MODE = process.env.DEMO_MODE === 'true';
    const otp = DEMO_MODE ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    try {
        await db.query(`
            INSERT INTO customer_otps (phone, otp_code, expires_at)
            VALUES ($1, $2, $3)
        `, [phone, otp, expiresAt]);

        if (!DEMO_MODE) {
            console.log("\n╔══════════════════════════════╗");
            console.log(`  📱 Customer OTP สำหรับ ${phone}`);
            console.log(`  🔑 รหัส OTP: ${otp}`);
            console.log("╚══════════════════════════════╝\n");
        }

        res.status(200).json({ success: true, message: `ส่ง OTP สำเร็จ (Demo: ${DEMO_MODE})` });
    } catch (err) {
        res.status(500).json({ success: false, message: "DB error", error: err.message });
    }
};

// ─── POST /api/customer/auth/verify-otp ──────────────────────────────────────
const verifyOtp = async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({ success: false, message: "กรุณากรอกเบอร์โทรและ OTP" });
    }

    try {
        // Verifica OTP in DB
        const result = await db.query(`
            SELECT id, expires_at, used
            FROM customer_otps 
            WHERE phone = $1 AND otp_code = $2 AND used = false
            ORDER BY created_at DESC LIMIT 1
        `, [phone, otp]);

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "OTP ไม่ถูกต้องหรือถูกใช้ไปแล้ว" });
        }

        const record = result.rows[0];
        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ success: false, message: "OTP หมดอายุแล้ว" });
        }

        // Mark OTP as used
        await db.query(`UPDATE customer_otps SET used = true WHERE id = $1`, [record.id]);

        // Check if customer exists
        let customer;
        let isNewCustomer = false;
        
        const custResult = await db.query(`SELECT * FROM customers WHERE phone = $1 LIMIT 1`, [phone]);
        if (custResult.rows.length > 0) {
            customer = custResult.rows[0];
        } else {
            // Create new customer
            const insert = await db.query(
                `INSERT INTO customers (phone) VALUES ($1) RETURNING *`, [phone]
            );
            customer = insert.rows[0];
            isNewCustomer = true;
        }

        if (!customer.is_active) {
            return res.status(403).json({ success: false, message: "บัญชีของคุณถูกระงับการใช้งาน" });
        }

        // Sign JWT
        const token = signCustomerToken({ id: customer.id, phone: customer.phone });

        res.status(200).json({
            success: true,
            token,
            isNewCustomer,
            customer: {
                id: customer.id,
                phone: customer.phone,
                name: customer.name,
                email: customer.email,
                address: customer.address
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "DB error", error: err.message });
    }
};

// ─── GET /api/customer/auth/me ───────────────────────────────────────────────
const getMe = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, phone, name, email, address, is_active 
            FROM customers WHERE id = $1
        `, [req.customer.id]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Customer not found" });
        
        res.status(200).json({ success: true, customer: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { requestOtp, verifyOtp, getMe };
