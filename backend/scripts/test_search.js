const { sendMessage } = require('../src/controllers/chatbotController');
const db = require('../src/config/supabaseClient');

async function checkEmbedding() {
    const { rows } = await db.query('SELECT * FROM product_embeddings WHERE product_id = 27');
    console.log("Embedding for product 27 exists?", rows.length > 0);
}

checkEmbedding().then(() => process.exit(0));
