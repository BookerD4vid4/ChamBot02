const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/orderController");
const { authenticate, requireAuth } = require("../middleware/auth");

router.use(authenticate);

// GET /api/orders/my  — user's own orders (requires login)
router.get("/my", requireAuth, ctrl.getMyOrders);

// GET /api/orders/:id/track  — public timeline (no auth required)
router.get("/:id/track", ctrl.trackOrder);

// POST /api/orders  — place order
router.post("/", ctrl.createOrder);

// PATCH /api/orders/:id/cancel  — user cancel own order
router.patch("/:id/cancel", requireAuth, ctrl.cancelOrder);

module.exports = router;
