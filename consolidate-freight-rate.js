require('dotenv').config();
const db = require('./config/db');

async function consolidateFreightRate() {
  try {
    console.log('🚀 Consolidating Freight Rate columns in order_dispatch table...');

    // 1. Add new column transfer_freight_rate
    await db.query(`
      ALTER TABLE order_dispatch 
      ADD COLUMN IF NOT EXISTS transfer_freight_rate NUMERIC DEFAULT 0
    `);

    // 2. (Optional) Copy data if any exists - skipping for now as it's a new feature
    // 3. (Optional) Drop old columns - keeping them for now to avoid errors in case of cached code
    
    console.log('✅ transfer_freight_rate column added successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error consolidating columns:', error);
    process.exit(1);
  }
}

consolidateFreightRate();
