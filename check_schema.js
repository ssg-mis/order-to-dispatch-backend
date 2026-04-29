require('dotenv').config();
const db = require('./config/db');

async function checkSchema() {
  try {
    const res = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'order_dispatch' AND table_schema = 'public'");
    console.log('Order Dispatch Columns:', res.rows.map(r => r.column_name).join(', '));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
