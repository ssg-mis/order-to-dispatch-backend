/**
 * Script to run database migrations
 * This ensures the order number trigger is set up correctly
 */

const db = require('../config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔄 Running database migration: create_order_trigger.sql');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../migrations/create_order_trigger.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    await db.query(sqlContent);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Order number auto-generation trigger is now active.');
    console.log('   Orders will be generated in format: DO-001A, DO-001B, etc.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
