const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function verify() {
  const client = await pool.connect();
  try {
    console.log('Verifying SKU Details data...');
    const res = await client.query('SELECT id, status, sku_code, sku_name FROM sku_details ORDER BY id DESC LIMIT 5');
    console.table(res.rows);
  } catch (err) {
    console.error('Error executing verify:', err);
  } finally {
    client.release();
    pool.end();
  }
}

verify();
