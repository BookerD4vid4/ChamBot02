const jwt = require("jsonwebtoken");

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || "chambot_customer_secret_replace_in_prod";

/**
 * Extract user from Bearer token for customer requests. Sets req.customer if valid.
 */
const verifyCustomerToken = (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized — missing token" });
    }

    try {
        req.customer = jwt.verify(token, CUSTOMER_JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, message: "Unauthorized — invalid or expired token" });
    }
};

/** Sign a token (utility for customer login route) */
const signCustomerToken = (payload) => jwt.sign(payload, CUSTOMER_JWT_SECRET, { expiresIn: "30d" });

/** Optional auth — attaches req.customer if valid token present, but never blocks */
const optionalCustomerAuth = (req, _res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
        try { req.customer = jwt.verify(token, CUSTOMER_JWT_SECRET); } catch { /* ignore */ }
    }
    next();
};

module.exports = { verifyCustomerToken, signCustomerToken, optionalCustomerAuth };
