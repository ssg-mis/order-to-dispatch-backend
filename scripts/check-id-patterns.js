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

async function checkIds() {
  const client = await pool.connect();
  try {
    const tables = [
      { name: 'customer_details', col: 'customer_id', sort: 'id' }, // customers has id
      { name: 'depot_details', col: 'depot_id', sort: 'depot_id' }, // assume depot_id is the key
      { name: 'broker_details', col: 'broker_id', sort: 'broker_id' }, // assume broker_id is the key
      { name: 'sku_details', col: 'sku_code', sort: 'id' } // sku has id
    ];

    for (const t of tables) {
      console.log(`--- ${t.name} (${t.col}) ---`);
      try {
        const res = await client.query(`SELECT ${t.col} FROM ${t.name} ORDER BY ${t.sort} DESC LIMIT 5`);
        res.rows.forEach(r => console.log(r[t.col]));
      } catch (e) {
        console.log(`Error querying ${t.name}:`, e.message);
        // Fallback to sorting by the col if id failed
        if (t.sort === 'id') {
           try {
             const res = await client.query(`SELECT ${t.col} FROM ${t.name} ORDER BY ${t.col} DESC LIMIT 5`);
             res.rows.forEach(r => console.log(r[t.col]));
           } catch (e2) {
             console.log(`Fallback failed for ${t.name}:`, e2.message);
           }
        }
      }
      console.log('');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

checkIds();
