const express = require("express");
const router = express.Router();
const { sendMessage } = require("../controllers/chatbotController");
const { authenticate } = require("../middleware/auth");

// POST /api/chatbot/message
// Optional auth — enriches context if logged in, open to guests too
router.post("/message", authenticate, sendMessage);

module.exports = router;
