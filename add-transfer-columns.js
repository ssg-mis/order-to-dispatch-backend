require('dotenv').config();
const db = require('./config/db');

async function addTransferColumns() {
  try {
    console.log('🚀 Adding Transfer columns to order_dispatch table...');

    // Add columns to order_dispatch
    await db.query(`
      ALTER TABLE order_dispatch 
      ADD COLUMN IF NOT EXISTS transfer TEXT DEFAULT 'no',
      ADD COLUMN IF NOT EXISTS bill_company_name TEXT,
      ADD COLUMN IF NOT EXISTS bill_address TEXT,
      ADD COLUMN IF NOT EXISTS bill_freight_rate NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ship_company_name TEXT,
      ADD COLUMN IF NOT EXISTS ship_address TEXT,
      ADD COLUMN IF NOT EXISTS ship_freight_rate NUMERIC DEFAULT 0
    `);

    console.log('✅ Transfer columns added successfully to order_dispatch');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }
}

addTransferColumns();
