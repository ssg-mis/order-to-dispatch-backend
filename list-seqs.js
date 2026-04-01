require('dotenv').config();
const db = require('./config/db');

async function listSeqs() {
  try {
    const res = await db.query(`SELECT relname FROM pg_class WHERE relkind = 'S'`);
    console.log('SEQUENCES:');
    res.rows.forEach(r => console.log(r.relname));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

listSeqs();
