const omiseService = require('../services/omiseService');
const db = require('../config/supabaseClient');

// ─── POST /api/payment/create ────────────────────────────────────────────────
const createPayment = async (req, res) => {
    try {
        const { orderId, method } = req.body;
        if (!orderId || !method) {
            return res.status(400).json({ success: false, message: "orderId and method are required" });
        }

        // ─── DEMO MODE: AUTO-CONFIRM ALL PAYMENTS ───
        // Bypass Omise entirely — instantly mark the order as paid and confirmed.
        await db.query(
            `UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE order_id = $1`,
            [orderId]
        );
        await db.query(
            `INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES ($1, 'confirmed', 'system', 'Demo: Auto-Confirmed Payment')`,
            [orderId]
        );

        return res.status(200).json({ success: true, data: { status: 'paid', method, orderId } });

    } catch (err) {
        console.error("Payment create error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET /api/payment/:orderId/status ─────────────────────────────────────────
const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const payRes = await db.query(`SELECT status, method, qr_code_url, amount FROM payments WHERE order_id = $1::int ORDER BY created_at DESC LIMIT 1`, [orderId]);
        if (payRes.rows.length === 0) return res.status(404).json({ success: false, message: "No payment found" });
        
        return res.status(200).json({ success: true, payment: payRes.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── POST /api/payment/webhook ────────────────────────────────────────────────
const omiseWebhook = async (req, res) => {
    try {
        // Omise events
        const payload = req.body;
        console.log("Webhook payload:", payload.key);

        // 1. Log webhook
        await db.query(`INSERT INTO payment_webhooks (event_type, payload) VALUES ($1, $2)`, [payload.key || 'unknown', payload]);

        // Verify signature (optional/stub)
        if (!omiseService.verifyWebhookSignature(JSON.stringify(payload), req.headers['x-omise-signature'])) {
            return res.status(401).send("Invalid Signature");
        }

        // 2. Handle specific events
        if (payload.key === 'charge.complete') {
            const chargeData = payload.data;
            if (chargeData && chargeData.id) {
                await omiseService.handleChargeComplete(chargeData.id);
            }
        }

        // We must return 200 OK fast so Omise doesn't retry
        res.status(200).send("OK");
    } catch (err) {
        console.error("Webhook error:", err);
        // Even on error, it's safer to return 200 if it's our code failure, to prevent spam. But Omise expects 200.
        res.status(500).send("Error processing webhook");
    }
};

module.exports = {
    createPayment,
    getPaymentStatus,
    omiseWebhook
};
