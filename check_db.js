require('dotenv').config();
const db = require('./config/db');

async function checkData() {
  try {
    const res = await db.query('SELECT order_no, total_amount_with_gst, created_at FROM order_dispatch WHERE total_amount_with_gst IS NOT NULL AND total_amount_with_gst > 0 LIMIT 5');
    console.log('Sample Revenue Orders:', res.rows);
    
    const resCount = await db.query('SELECT COUNT(*) FROM order_dispatch');
    console.log('Total Orders:', resCount.rows[0].count);
    
    const resAmount = await db.query('SELECT SUM(total_amount_with_gst) FROM order_dispatch');
    console.log('Total Amount Sum:', resAmount.rows[0].sum);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
