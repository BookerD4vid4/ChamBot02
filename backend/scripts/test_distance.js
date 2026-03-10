const { embedQuery } = require('../src/services/embeddingService');
const db = require('../src/config/supabaseClient');

async function test() {
    try {
        const queries = ["กล้วย", "มีกล้วยไหม", "กล้วยไหม"];
        for (const q of queries) {
            console.log(`\n--- Testing Query: "${q}" ---`);
            const v = await embedQuery(q);
            const { rows } = await db.query(
                `SELECT p.name, pe.embedding <=> $1::vector as dist
                 FROM products p JOIN product_embeddings pe ON p.product_id = pe.product_id
                 WHERE p.name ILIKE '%กล้วย%'`,
                [`[${v.join(',')}]`]
            );
            console.log(rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
