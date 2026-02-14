require('dotenv').config();
const db = require('./config/db');

async function fixTrigger() {
  try {
    console.log('🚀 Starting Database Trigger Fix...');

    // 1. Update the function with correct field names
    console.log('Updating function set_planned_3_from_actual_2...');
    await db.query(`
      CREATE OR REPLACE FUNCTION set_planned_3_from_actual_2()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only generate planned_3 (Material Load) if actual_2 (Approval) exists
        -- AND the overall status is 'Approved'
        
        IF NEW.actual_2 IS NOT NULL AND NEW.overall_status_of_order = 'Approved' THEN
           NEW.planned_3 := NEW.actual_2;
        ELSE
           -- If rejected or actual_2 is null, clear planned_3
           NEW.planned_3 := NULL;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Function updated successfully');

    // 2. Ensure the trigger exists
    console.log('Re-creating trigger trg_set_planned_3...');
    await db.query(`DROP TRIGGER IF EXISTS trg_set_planned_3 ON order_dispatch`);
    await db.query(`
      CREATE TRIGGER trg_set_planned_3
      BEFORE UPDATE ON order_dispatch
      FOR EACH ROW
      -- Only trigger if actual_2 is changing to a non-null value
      -- OR if the approval status is being set
      WHEN (NEW.actual_2 IS NOT NULL AND (OLD.actual_2 IS NULL OR NEW.overall_status_of_order <> OLD.overall_status_of_order))
      EXECUTE FUNCTION set_planned_3_from_actual_2();
    `);
    console.log('✅ Trigger trg_set_planned_3 re-created successfully');

    console.log('\n✨ Database trigger fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing database trigger:', error);
    process.exit(1);
  }
}

fixTrigger();
