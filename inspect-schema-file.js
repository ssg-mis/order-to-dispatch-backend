const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');
const fs = require('fs');

async function inspectTable() {
  try {
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'order_dispatch'
      ORDER BY ordinal_position
    `);
    
    let output = 'Columns in order_dispatch:\n';
    columns.rows.forEach(c => {
      output += `- ${c.column_name} (${c.data_type})\n`;
    });
    
    fs.writeFileSync('schema-output.txt', output);
    console.log('Schema output written to schema-output.txt');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectTable();
