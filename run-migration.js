/**
 * Run Migration to Create Order Number Sequence Table
 */

const db = require('./config/db');

async function runMigration() {
  try {
    console.log('Creating order_number_sequence table...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_number_sequence (
          id INTEGER PRIMARY KEY DEFAULT 1,
          last_number INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT single_row CHECK (id = 1)
      )
    `);
    
    console.log('✅ Table created');
    
    console.log('Initializing sequence...');
    await db.query(`
      INSERT INTO order_number_sequence (id, last_number) 
      VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING
    `);
    
    console.log('✅ Sequence initialized');
   console.log('Creating index...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_order_no ON order_dispatch(order_no)
    `);
    
    console.log('✅ Index created');
    console.log('\n✅ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
