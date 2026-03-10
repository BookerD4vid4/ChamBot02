const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// Authentication middleware can be placed on specific endpoints requiring it if needed,
// but for flexibility, these might be public or protected by customerAuth or adminAuth.
// The Webhook route MUST be public

router.post("/create", paymentController.createPayment);
router.get("/:orderId/status", paymentController.getPaymentStatus);
router.post("/webhook", paymentController.omiseWebhook);

module.exports = router;
