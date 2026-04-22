
require('dotenv').config();
const db = require('../config/db');

async function addColumn() {
  try {
    // Add vehicle_master_id column for display ID (e.g. VICL001)
    await db.query(`
      ALTER TABLE vehicle_master 
      ADD COLUMN IF NOT EXISTS vehicle_master_id VARCHAR(50) UNIQUE;
    `);
    console.log('✅ Column vehicle_master_id added successfully');
  } catch (err) {
    console.error('❌ Error adding column:', err.message);
  } finally {
    process.exit();
  }
}

addColumn();
