require('dotenv').config();
const db = require('./config/db');

async function inspectSchema() {
  try {
    const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lift_receiving_confirmation' ORDER BY column_name");
    const cols = res.rows.map(r => r.column_name).join('\n');
    const fs = require('fs');
    fs.writeFileSync('schema_verified.txt', cols);
    console.log('Schema written to schema_verified.txt');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectSchema();
