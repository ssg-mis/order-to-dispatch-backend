require('dotenv').config();
const db = require('./config/db');

async function check() {
  try {
    const res = await db.query('SELECT * FROM order_number_sequence');
    console.log(res.rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
