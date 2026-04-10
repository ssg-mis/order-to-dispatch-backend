const db = require('./config/db');

async function checkData() {
  try {
    const result = await db.query("SELECT id, order_no, planned_3, actual_3 FROM order_dispatch WHERE order_no LIKE 'DO-657%' ORDER BY order_no");
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkData();
