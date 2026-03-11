require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
});

const run = async () => {
    try {
        const client = await pool.connect();
        console.log('Connected to database');
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables in public schema:');
        res.rows.forEach(row => console.log(`- ${row.table_name}`));

        // Check if sku_selling_price exists
        const hasTable = res.rows.some(row => row.table_name === 'sku_selling_price');
        console.log(`\nDoes 'sku_selling_price' exist? ${hasTable}`);

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
};

run();
