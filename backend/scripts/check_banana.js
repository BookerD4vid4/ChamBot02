const db = require('../src/config/supabaseClient');
async function run() {
    try {
        const { rows } = await db.query("SELECT product_id, name, is_active FROM products WHERE name ILIKE $1", ['%กล้วย%']);
        console.log("Found products containing 'กล้วย':", rows);
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        process.exit(0);
    }
}
run();
