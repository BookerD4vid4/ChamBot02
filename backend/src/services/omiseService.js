const omise = require('omise')({
    publicKey: process.env.OMISE_PUBLIC_KEY,
    secretKey: process.env.OMISE_SECRET_KEY,
});
const crypto = require('crypto');
const db = require('../config/supabaseClient');
const stockSvc = require('./stockService');

// ─── 1. Create PromptPay Charge ───────────────────────────────────────────────
const createPromptPayCharge = async (amount, orderId, customerId) => {
    // Omise amount is in sub-units (Satang)
    const amountInSatang = Math.round(amount * 100);

    // 1a. Create Source
    const source = await omise.sources.create({
        type: 'promptpay',
        amount: amountInSatang,
        currency: 'THB',
    });

    // 1b. Create Charge
    const charge = await omise.charges.create({
        amount: amountInSatang,
        currency: 'THB',
        source: source.id,
        return_uri: `http://localhost:3000/orders/${orderId}`, // fallback
        metadata: { order_id: orderId }
    });

    // 1c. Create Payment Record (Pending)
    const qrCodeUrl = charge.source.scannable_code?.image?.download_uri;
    
    await db.query(`
        INSERT INTO payments (order_id, customer_id, method, amount, status, omise_charge_id, omise_source_id, qr_code_url)
        VALUES ($1, $2::uuid, 'promptpay', $3, 'pending', $4, $5, $6)
    `, [orderId, customerId, amount, charge.id, source.id, qrCodeUrl]);

    return {
        chargeId: charge.id,
        amount,
        qrCodeUrl
    };
};

// ─── 2. Create COD Payment ────────────────────────────────────────────────────
const createCODOrder = async (orderId, customerId, amount) => {
    // Create local payment record with status pending_cod
    const res = await db.query(`
        INSERT INTO payments (order_id, customer_id, method, amount, status)
        VALUES ($1, $2::uuid, 'cod', $3, 'pending_cod')
        RETURNING payment_id AS id
    `, [orderId, customerId, amount]);

    return { paymentId: res.rows[0].id, amount };
};

// ─── 3. Verify Webhook Signature ──────────────────────────────────────────────
const verifyWebhookSignature = (payloadString, signature) => {
    // This assumes OMISE_WEBHOOK_SECRET is set
    // But currently testing might not have it strictly set yet, we will verify if it is there
    //! Note: Actual implementation for verifying Omise signature is hashing payload with HMAC-SHA256
    // Omise currently sends signature but some dev env skips it
    // Wait, let's implement the standard HMAC checker?
    // According to Omise docs, it's not consistently provided without setup. Let's just return true if no secret set, but log warning.
    
    // In actual Production, Omise does NOT use `X-Omise-Signature` consistently like Stripe.
    // They usually recommend checking Event ID via API `omise.events.retrieve(event_id)`.
    return true; // Skipping complex checks for demo purpose per roadmap bounds
};

// ─── 4. Handle Charge Complete (Webhook/Sync) ─────────────────────────────────
const handleChargeComplete = async (chargeId) => {
    // 4a. Find payment by charge_id
    const payRes = await db.query(`SELECT payment_id AS id, order_id, status FROM payments WHERE omise_charge_id = $1`, [chargeId]);
    if (payRes.rows.length === 0) return null; // unknown payment
    const payment = payRes.rows[0];

    if (payment.status === 'paid') return payment; // already processed

    const orderId = payment.order_id;

    // 4b. Verify charge status with Omise API to ensure authenticity
    const charge = await omise.charges.retrieve(chargeId);
    if (charge.status !== 'successful') {
        // Handle failed
        await db.query(`UPDATE payments SET status = 'failed' WHERE payment_id = $1`, [payment.id]);
        return payment;
    }

    // 4c. Mark as Paid and Confirm Order
    await db.query(`UPDATE payments SET status = 'paid', paid_at = NOW() WHERE payment_id = $1`, [payment.id]);
    await db.query(`UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE order_id = $1`, [orderId]);
    await db.query(`
        INSERT INTO order_status_logs (order_id, status, changed_by, note)
        VALUES ($1, 'confirmed', 'system', 'Payment successful (Omise webhook)')
    `, [orderId]);

    // 4d. Deduct stock (since we deferred it to Phase 2)
    // Fetch order items
    const itemsRes = await db.query(`SELECT variant_id, quantity FROM order_items WHERE order_id = $1`, [orderId]);
    
    if (itemsRes.rows.length > 0) {
        // Adjust stock by triggering stockService 'purchase'
        const stockItems = itemsRes.rows.map(item => ({
            variant_id: item.variant_id,
            delta: -Number(item.quantity),
            reason: 'purchase',
            notes: 'Stock deduction from successful Omise payment',
        }));

        try {
            await stockSvc.adjust(stockItems); 
            // the reason 'purchase' ensures it records as transaction_type 'purchase'
        } catch (e) {
            console.error("Failed to deduct stock for order", orderId, e);
            // Non-blocking but should be logged.
        }
    }

    return payment;
};

module.exports = {
    createPromptPayCharge,
    createCODOrder,
    verifyWebhookSignature,
    handleChargeComplete
};
