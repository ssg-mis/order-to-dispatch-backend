/**
 * Update Trigger for Renamed Column
 * Updates the trigger to use planned_2 instead of planned_dispatch
 */

const db = require('./config/db');

async function updateTrigger() {
  try {
    console.log('Updating trigger function...');
    
    // Drop old trigger
    await db.query(`DROP TRIGGER IF EXISTS trg_set_planned_dispatch ON order_dispatch`);
    console.log('✅ Old trigger dropped');
    
    // Update function to use new column name
    await db.query(`
      CREATE OR REPLACE FUNCTION set_planned_dispatch()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.planned_2 := CURRENT_TIMESTAMP::TEXT;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Function updated to use planned_2');
    
    // Recreate trigger
    await db.query(`
      CREATE TRIGGER trg_set_planned_dispatch
      BEFORE INSERT ON order_dispatch
      FOR EACH ROW
      WHEN (NEW.planned_2 IS NULL)
      EXECUTE FUNCTION set_planned_dispatch();
    `);
    console.log('✅ Trigger recreated');
    
    console.log('\n✅ Trigger updated successfully!');
    console.log('Now planned_2 will be auto-set on INSERT');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating trigger:', error.message);
    process.exit(1);
  }
}

updateTrigger();
