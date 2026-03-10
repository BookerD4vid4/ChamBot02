const express = require("express");
const router = express.Router();
const orderService = require("../services/orderService");

// ─── Slim response helper ─────────────────────────────────────────────────────
const ok = (res, data, meta = {}) => res.status(200).json({ success: true, data, ...meta });
const created = (res, data) => res.status(201).json({ success: true, data });
const fail = (res, err) => {
    console.error("DEBUG ERROR:", err);
    const code = err.statusCode || 500;
    res.status(code).json({ success: false, message: err.message });
};

// ─── Admin: GET /api/admin/orders ─────────────────────────────────────────────
const getAllOrders = async (req, res) => {
    try {
        const { status, search, date_from, date_to, page, limit } = req.query;
        const result = await orderService.getAllOrders({ status, search, date_from, date_to, page, limit });
        ok(res, result.data, { total: result.total, page: result.page, limit: result.limit });
    } catch (err) { fail(res, err); }
};

// ─── Admin: GET /api/admin/orders/:id ────────────────────────────────────────
const getOrderById = async (req, res) => {
    try {
        const order = await orderService.getOrderById(req.params.id);
        ok(res, order);
    } catch (err) { fail(res, err); }
};

// ─── Admin: PATCH /api/admin/orders/:id/status ───────────────────────────────
const updateStatus = async (req, res) => {
    try {
        const { status, tracking_number, shipping_provider, note } = req.body;
        if (!status) return res.status(400).json({ success: false, message: "status is required" });
        const changed_by = req.user?.full_name || req.user?.phone_number || "admin";
        const order = await orderService.updateStatus(req.params.id, {
            status, tracking_number, shipping_provider, note, changed_by,
        });
        ok(res, order);
    } catch (err) { fail(res, err); }
};

// ─── User: GET /api/orders/my ────────────────────────────────────────────────
const getMyOrders = async (req, res) => {
    try {
        const { page, limit } = req.query;
        const result = await orderService.getMyOrders(req.user.id, { page, limit });
        ok(res, result.data, { total: result.total, page: result.page, limit: result.limit });
    } catch (err) { fail(res, err); }
};

// ─── User: GET /api/orders/:id/track ─────────────────────────────────────────
const trackOrder = async (req, res) => {
    try {
        const data = await orderService.trackOrder(req.params.id);
        ok(res, data);
    } catch (err) { fail(res, err); }
};

// ─── POST /api/orders ────────────────────────────────────────────────────────
const createOrder = async (req, res) => {
    try {
        const order = await orderService.createOrder(req.body);
        created(res, order);
    } catch (err) { fail(res, err); }
};

// ─── User: PATCH /api/orders/:id/cancel ──────────────────────────────────────
const cancelOrder = async (req, res) => {
    try {
        const order = await orderService.cancelOrder(req.params.id, req.user.id);
        ok(res, order);
    } catch (err) { fail(res, err); }
};

module.exports = { getAllOrders, getOrderById, updateStatus, getMyOrders, trackOrder, createOrder, cancelOrder };
