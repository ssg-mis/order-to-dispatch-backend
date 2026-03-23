const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function inspectOrder() {
  try {
    const orderNo = 'DO-637B';
    console.log(`--- Inspecting order: ${orderNo} ---`);
    
    const odRows = await db.query('SELECT id, order_no, product_name, timestamp FROM order_dispatch WHERE order_no = $1', [orderNo]);
    console.log('\norder_dispatch rows:');
    console.table(odRows.rows);

    const lrcRows = await db.query('SELECT d_sr_number, so_no, product_name_1, timestamp FROM lift_receiving_confirmation WHERE so_no = $1', [orderNo]);
    console.log('\nlift_receiving_confirmation rows:');
    console.table(lrcRows.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectOrder();
