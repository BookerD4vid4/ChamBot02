const db = require("../config/supabaseClient");

// ─── Find All (admin) ────────────────────────────────────────────────────────
const findAll = async ({ status, search, date_from, date_to, page = 1, limit = 20 }) => {
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        conditions.push(`(order_id::text LIKE $${params.length} OR customer_name ILIKE $${params.length} OR tracking_number ILIKE $${params.length})`);
    }
    if (date_from) {
        params.push(date_from);
        conditions.push(`created_at >= $${params.length}`);
    }
    if (date_to) {
        params.push(date_to);
        conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * limit;

    const countResult = await db.query(
        `SELECT COUNT(*) FROM order_list_view ${where}`, params
    );
    params.push(limit, offset);
    const dataResult = await db.query(
        `SELECT olv.*,
                cl.note         AS cancel_note,
                cl.changed_by   AS cancelled_by
         FROM order_list_view olv
         LEFT JOIN LATERAL (
             SELECT note, changed_by
             FROM order_status_logs
             WHERE order_id = olv.order_id AND status = 'cancelled'
             ORDER BY created_at DESC
             LIMIT 1
         ) cl ON true
         ${where.replace(/WHERE /i, 'WHERE olv.')}
         ORDER BY olv.order_id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    return {
        data: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };
};

// ─── Find One by ID ───────────────────────────────────────────────────────────
const findById = async (id) => {
    const orderResult = await db.query(
        `SELECT o.*, u.full_name AS customer_name, u.phone_number AS customer_phone
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.order_id = $1`, [id]
    );
    if (orderResult.rows.length === 0) return null;

    const [items, shipment, payment, timeline] = await Promise.all([
        db.query(
            `SELECT oi.*, pv.sku, p.name AS product_name, pv.image_url
             FROM order_items oi
             JOIN product_variants pv ON oi.variant_id = pv.variant_id
             JOIN products p ON pv.product_id = p.product_id
             WHERE oi.order_id = $1`,
            [id]
        ),
        db.query(`SELECT s.*, ua.recipient_name, ua.address_line
                  FROM shipments s
                  LEFT JOIN user_addresses ua ON s.address_id = ua.address_id
                  WHERE s.order_id = $1`, [id]),
        db.query("SELECT * FROM payments WHERE order_id = $1", [id]),
        db.query(
            "SELECT status, changed_by, note, created_at FROM order_status_logs WHERE order_id = $1 ORDER BY created_at ASC",
            [id]
        ),
    ]);

    const order = orderResult.rows[0];
    order.items = items.rows;
    order.shipment = shipment.rows[0] || null;
    order.payment = payment.rows[0] || null;
    order.timeline = timeline.rows;
    return order;
};

// ─── Find Orders by User ──────────────────────────────────────────────────────
const findByUserId = async (userId, { page = 1, limit = 10 } = {}) => {
    const offset = (page - 1) * limit;
    const result = await db.query(
        `SELECT * FROM order_list_view WHERE user_id = $1 ORDER BY order_id DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );
    const count = await db.query(
        "SELECT COUNT(*) FROM orders WHERE user_id = $1", [userId]
    );
    return {
        data: result.rows,
        total: parseInt(count.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };
};

// ─── Update Status ────────────────────────────────────────────────────────────
const updateStatus = async (id, { status, tracking_number, shipping_provider }) => {
    const fields = ["status = $1", "updated_at = NOW()"];
    const params = [status, id];

    if (tracking_number !== undefined) {
        params.splice(1, 0, tracking_number);
        fields.push(`tracking_number = $2`);
    }
    if (shipping_provider !== undefined) {
        params.splice(fields.length - 1, 0, shipping_provider);
        fields.push(`shipping_provider = $${fields.length}`);
    }

    // rebuild params clean
    const cleanParams = [status];
    const cleanFields = ["status = $1", "updated_at = NOW()"];
    if (tracking_number !== undefined) {
        cleanParams.push(tracking_number);
        cleanFields.push(`tracking_number = $${cleanParams.length}`);
    }
    if (shipping_provider !== undefined) {
        cleanParams.push(shipping_provider);
        cleanFields.push(`shipping_provider = $${cleanParams.length}`);
    }
    cleanParams.push(id);

    const result = await db.query(
        `UPDATE orders SET ${cleanFields.join(", ")} WHERE order_id = $${cleanParams.length} RETURNING *`,
        cleanParams
    );
    return result.rows[0];
};

// ─── Add Status Log ───────────────────────────────────────────────────────────
const addStatusLog = async (order_id, { status, changed_by = "system", note = null }) => {
    const result = await db.query(
        `INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES ($1, $2, $3, $4) RETURNING *`,
        [order_id, status, changed_by, note]
    );
    return result.rows[0];
};

// ─── Get Timeline only ────────────────────────────────────────────────────────
const getTimeline = async (id) => {
    const order = await db.query(
        `SELECT order_id, status, tracking_number, shipping_provider FROM orders WHERE order_id = $1`, [id]
    );
    if (order.rows.length === 0) return null;
    const logs = await db.query(
        `SELECT status, changed_by, note, created_at FROM order_status_logs WHERE order_id = $1 ORDER BY created_at ASC`,
        [id]
    );
    return { ...order.rows[0], timeline: logs.rows };
};

// ─── Get current status ───────────────────────────────────────────────────────
const getStatus = async (id) => {
    const result = await db.query("SELECT status FROM orders WHERE order_id = $1", [id]);
    return result.rows[0]?.status || null;
};

// ─── Create Order (transaction) ───────────────────────────────────────────────
const createOrder = async ({ user_id, items, total_amount, payment_method, address_id, address }) => {
    await db.query("BEGIN");
    try {
        const orderRes = await db.query(
            "INSERT INTO orders (user_id, total_amount, status, payment_status) VALUES ($1, $2, 'pending', 'pending') RETURNING *",
            [user_id, total_amount]
        );
        const newOrder = orderRes.rows[0];

        for (const item of items) {
            await db.query(
                "INSERT INTO order_items (order_id, variant_id, price, quantity) VALUES ($1, $2, $3, $4)",
                [newOrder.order_id, item.variant_id, item.price, item.quantity]
            );
            // Removed deferred stock deduction, now handled by Omise Service on payment completion
        }

        if (payment_method && payment_method !== 'omise') {
             // Fallback for legacy flows
             await db.query(
                 "INSERT INTO payments (order_id, method, status) VALUES ($1, $2, 'pending')",
                 [newOrder.order_id, payment_method]
             );
        }

        // Resolve address_id — use provided id or create ad-hoc address
        let resolvedAddressId = address_id || null;
        if (!resolvedAddressId && address) {
            // address is a plain text string from old flow — store as user_address
            const addrRes = await db.query(
                "INSERT INTO user_addresses (user_id, recipient_name, address_line) VALUES ($1, $2, $3) RETURNING address_id",
                [user_id, null, address]
            );
            resolvedAddressId = addrRes.rows[0].address_id;
        }

        await db.query(
            "INSERT INTO shipments (order_id, address_id, status) VALUES ($1, $2, 'preparing')",
            [newOrder.order_id, resolvedAddressId]
        );

        // Log initial status
        await db.query(
            "INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES ($1, 'pending', 'system', 'Order created')",
            [newOrder.order_id]
        );

        await db.query("COMMIT");
        return newOrder;
    } catch (err) {
        await db.query("ROLLBACK");
        throw err;
    }
};


module.exports = { findAll, findById, findByUserId, updateStatus, addStatusLog, getTimeline, getStatus, createOrder };
