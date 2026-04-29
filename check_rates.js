require('dotenv').config();
const db = require('./config/db');

async function checkRates() {
  try {
    const res = await db.query('SELECT order_no, order_quantity, final_rate, approval_rate_of_material, total_amount_with_gst FROM order_dispatch WHERE order_quantity > 0 LIMIT 10');
    console.log('Sample Data:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkRates();
