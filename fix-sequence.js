require('dotenv').config();
const db = require('./config/db');

async function fixSequence() {
  try {
    console.log('Fixing order_number_sequence data and primary key...');
    
    // 1. Update existing null financial_year to some value if it exists
    // This allows ON CONFLICT to work properly.
    await db.query(`
      UPDATE order_number_sequence 
      SET financial_year = '25-26' 
      WHERE id = 1 AND financial_year IS NULL;
    `);
    
    // 2. Sync the ID sequence to prevent duplicate key errors
    // Use the explicit name we found: order_number_sequence_id_seq
    const seqName = 'order_number_sequence_id_seq';
    const maxIdRes = await db.query("SELECT MAX(id) FROM order_number_sequence");
    const maxId = maxIdRes.rows[0].max || 0;
    
    console.log(`Max ID found: ${maxId}`);
    
    await db.query(`SELECT setval('${seqName}', ${Math.max(1, maxId)}, true)`);
    
    const nextVal = await db.query(`SELECT nextval('${seqName}')`);
    console.log(`Next value will be (one consumed): ${nextVal.rows[0].nextval}`);
    
    console.log('✅ Sequence and data fixed!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error fixing sequence:', e);
    process.exit(1);
  }
}

fixSequence();
