const service = require('./src/services/orderService');

(async () => {
    try {
        console.log("Calling cancelOrder...");
        const result = await service.cancelOrder(20, 1);
        console.log("Result:", result);
    } catch (err) {
        console.error("Test Cancel Error:", err);
    } finally {
        process.exit(0);
    }
})();
