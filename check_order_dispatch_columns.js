const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function checkColumns() {
  try {
    const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'order_dispatch'");
    const columns = res.rows.map(r => r.column_name).sort();
    console.log('Columns in order_dispatch:');
    columns.forEach(c => console.log(`- ${c}`));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkColumns();
