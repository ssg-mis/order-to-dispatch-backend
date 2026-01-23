/**
 * Reset Order Number Sequence
 * Use this script to manually reset the sequence to 0
 */

const db = require('./config/db');

async function resetSequence() {
  try {
    console.log('Resetting order number sequence...');
    
    const result = await db.query(`
      UPDATE order_number_sequence 
      SET last_number = 0
      WHERE id = 1
      RETURNING last_number
    `);
    
    console.log('✅ Sequence reset to:', result.rows[0]?.last_number || 0);
    console.log('Next order will be: DO-001');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting sequence:', error.message);
    process.exit(1);
  }
}

resetSequence();
