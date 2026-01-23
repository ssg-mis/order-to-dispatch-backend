require('dotenv').config();
const { pool } = require('../config/db');

async function checkSkus() {
  try {
    console.log('Checking SKU count...');
    const res = await pool.query('SELECT COUNT(*) FROM sku_details');
    console.log('Total SKUs:', res.rows[0].count);
    
    if (parseInt(res.rows[0].count) > 0) {
        const sample = await pool.query('SELECT sku_name, status FROM sku_details LIMIT 5');
        console.log('Sample SKUs:', sample.rows);
    }
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    pool.end();
  }
}

checkSkus();
