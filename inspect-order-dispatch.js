const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function inspectTable() {
  try {
    console.log('--- Inspecting Table: order_dispatch ---');
    
    // 1. List all columns
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'order_dispatch'
      ORDER BY ordinal_position
    `);
    console.log('\nColumns:');
    columns.rows.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));

    // 2. Fetch a few rows to see data
    const rows = await db.query(`
      SELECT id, order_no, order_quantity, approval_qty, remaining_dispatch_qty, order_type
      FROM order_dispatch 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('\nSample Data:');
    console.table(rows.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectTable();
