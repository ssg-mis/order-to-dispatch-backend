require('dotenv').config();
const db = require('./config/db');

async function debug() {
  try {
    const res = await db.query('SELECT * FROM order_number_sequence');
    console.log('--- order_number_sequence ---');
    console.log(res.rows);
    
    const constraints = await db.query(`
      SELECT conname, contype
      FROM pg_constraint 
      WHERE conrelid = 'order_number_sequence'::regclass
    `);
    console.log('\n--- Constraints ---');
    console.log(constraints.rows);
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

debug();
