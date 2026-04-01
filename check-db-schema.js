require('dotenv').config();
const db = require('./config/db');

async function checkSchema() {
  try {
    const tableDef = await db.query(`
      SELECT 
          column_name, 
          data_type, 
          column_default, 
          is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'order_number_sequence'
    `);
    console.log('--- Table Columns ---');
    console.log(tableDef.rows);
    
    const allSeqs = await db.query(`
      SELECT relname FROM pg_class WHERE relkind = 'S'
    `);
    console.log('\n--- All Sequences ---');
    console.log(allSeqs.rows);

    const data = await db.query('SELECT * FROM order_number_sequence');
    console.log('\n--- Table Data ---');
    console.log(data.rows);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkSchema();
