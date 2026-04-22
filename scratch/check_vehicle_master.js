
const db = require('../config/db');

async function checkTable() {
  try {
    const res = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vehicle_master'
      ORDER BY ordinal_position;
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkTable();
