const express = require("express");
const router = express.Router();
const customerAuthController = require("../controllers/customerAuthController");
const { verifyCustomerToken } = require("../middleware/customerAuth");

router.post("/request-otp", customerAuthController.requestOtp);
router.post("/verify-otp", customerAuthController.verifyOtp);
router.get("/me", verifyCustomerToken, customerAuthController.getMe);

module.exports = router;
