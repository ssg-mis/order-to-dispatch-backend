require('dotenv').config();
const { query } = require('./config/db');

async function migrate() {
  try {
    await query(`
      ALTER TABLE transport_master 
      ADD COLUMN IF NOT EXISTS transport_master_id VARCHAR(20) UNIQUE
    `);
    console.log('Column transport_master_id added successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();
