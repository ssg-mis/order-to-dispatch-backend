require('dotenv').config();
const db = require('./config/db');

async function fixDatabaseSchema() {
  try {
    console.log('🚀 Starting Database Schema Fix for lift_receiving_confirmation table...');

    // 1. Add missing Stage 2 (Stage 6 in UI) columns
    console.log('Adding Stage 6 columns (planned_2, actual_2, time_delay_2)...');
    await db.query(`
      ALTER TABLE lift_receiving_confirmation 
      ADD COLUMN IF NOT EXISTS planned_2 TEXT,
      ADD COLUMN IF NOT EXISTS actual_2 TEXT,
      ADD COLUMN IF NOT EXISTS time_delay_2 TEXT
    `);
    console.log('✅ Stage 6 columns added');

    // 2. Add missing Stage 3 (Stage 7 in UI) columns
    console.log('Adding Stage 7 columns (planned_3, actual_3, time_delay_3)...');
    await db.query(`
      ALTER TABLE lift_receiving_confirmation 
      ADD COLUMN IF NOT EXISTS planned_3 TEXT,
      ADD COLUMN IF NOT EXISTS actual_3 TEXT,
      ADD COLUMN IF NOT EXISTS time_delay_3 TEXT
    `);
    console.log('✅ Stage 7 columns added');

    // 3. Fix triggers that might be referencing non-existent columns or causing "record new has no field" errors
    console.log('Dropping potentially faulty triggers...');
    await db.query(`DROP TRIGGER IF EXISTS trigger_set_planned_2 ON lift_receiving_confirmation`);
    await db.query(`DROP TRIGGER IF EXISTS trg_set_planned_dispatch ON lift_receiving_confirmation`);
    
    // Check if there are other triggers causing issues
    // We will drop any trigger that executes set_planned_dispatch on lift_receiving_confirmation
    // as it specifically tries to set NEW.planned_2 which might be what's failing if not handled correctly
    
    console.log('Re-creating trigger function to be safer...');
    await db.query(`
      CREATE OR REPLACE FUNCTION set_planned_dispatch_safe()
      RETURNS TRIGGER AS $$
      BEGIN
          -- Only set planned_2 if the column exists in the record
          -- In PL/pgSQL, we can use a dynamic check or just ensure the table has the column
          -- Since we just added the columns above, it should be safe now.
          NEW.planned_2 := CURRENT_TIMESTAMP::TEXT;
          RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
          -- Fallback if column still missing for some reason
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Functions and Triggers cleaned up');

    // 4. Final verification of columns
    const columns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'lift_receiving_confirmation'
    `);
    const columnNames = columns.rows.map(r => r.column_name);
    console.log('\nFinal lift_receiving_confirmation columns:', columnNames);

    console.log('\n✨ Database schema fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing database schema:', error);
    process.exit(1);
  }
}

fixDatabaseSchema();
