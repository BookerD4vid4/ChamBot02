const express = require("express");
const cors = require("cors");
require("dotenv").config();

const path = require("path");

const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const variantRoutes = require("./routes/variantRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminOrderRoutes = require("./routes/adminOrderRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const authRoutes = require("./routes/authRoutes");
const customerAuthRoutes = require("./routes/customerAuthRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const reportRoutes = require("./routes/reportRoutes");
const uploadController = require("./controllers/uploadController");
const ocrController = require("./controllers/ocrController");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
// Public Routes
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/variants", require("./routes/variantRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/auth", authRoutes);
app.use("/api/customer/auth", customerAuthRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/chatbot", chatbotRoutes);

// Admin Routes (all require requireAdmin middleware via their router files)
app.use("/api/admin/products", require("./routes/adminProductRoutes"));
app.use("/api/admin/variants", require("./routes/adminVariantRoutes"));
app.use("/api/admin/stock", require("./routes/adminStockRoutes"));
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/embeddings", require("./routes/embeddingRoutes"));

app.post("/api/upload", uploadController.upload.single("image"), uploadController.uploadImage);
app.post("/api/ocr/scan", ocrController.upload.single("image"), ocrController.scanImage);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: "Internal Server Error",
        error: err.message
    });
});

module.exports = app;
