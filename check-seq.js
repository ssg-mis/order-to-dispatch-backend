require('dotenv').config();
const db = require('./config/db');

async function checkSeq() {
  try {
    const res = await db.query("SELECT last_value FROM order_number_sequence_id_seq");
    console.log('--- sequence value ---');
    console.log(res.rows[0]);
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkSeq();
