require('dotenv').config();
const db = require('./config/db');

async function checkTriggers() {
  try {
    console.log('--- Triggers on lift_receiving_confirmation ---');
    const result = await db.query(`
      SELECT tgname, tgrelid::regclass, tgenabled, tgtype, proname
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE tgrelid = 'lift_receiving_confirmation'::regclass
    `);
    console.log(result.rows);

    console.log('\n--- Checking column existence ---');
    const columns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'lift_receiving_confirmation'
    `);
    console.log('Columns:', columns.rows.map(r => r.column_name));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTriggers();
