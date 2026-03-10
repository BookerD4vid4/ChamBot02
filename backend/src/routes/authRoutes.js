const express = require("express");
const router = express.Router();
const {
    requestOtp, verifyOtp, getMe, updateProfile,
    getAddresses, addAddress, updateAddress, deleteAddress
} = require("../controllers/authController");
const { authenticate, requireAuth } = require("../middleware/auth");

// Public
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);

// Protected — profile
router.get("/me",      authenticate, requireAuth, getMe);
router.patch("/profile", authenticate, requireAuth, updateProfile);

// Protected — addresses
router.get("/addresses",     authenticate, requireAuth, getAddresses);
router.post("/addresses",    authenticate, requireAuth, addAddress);
router.put("/addresses/:id", authenticate, requireAuth, updateAddress);
router.delete("/addresses/:id", authenticate, requireAuth, deleteAddress);

module.exports = router;
