/**
 * Fix the set_planned_by_order_type trigger function.
 *
 * Old logic: used 'Order Punch' TAT for both pre-approval and regular orders.
 * New logic:
 *   - pre-approval orders → planned_1 = now + 'Pre Approval' TAT
 *   - regular orders      → planned_2 = now + 'Approval of Order' TAT
 *
 * Run once: node fix-order-type-trigger.js
 */

require('dotenv').config();
const db = require('./config/db');

async function fixTrigger() {
  try {
    console.log('🚀 Fixing set_planned_by_order_type trigger...');

    await db.query(`
      CREATE OR REPLACE FUNCTION set_planned_by_order_type()
      RETURNS TRIGGER AS $$
      DECLARE
          pre_approval_tat INTERVAL;
          approval_of_order_tat INTERVAL;
      BEGIN
          SELECT stage_time INTO pre_approval_tat
          FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = 'preapproval'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          SELECT stage_time INTO approval_of_order_tat
          FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF lower(trim(NEW.order_type)) = 'regular' THEN
              NEW.planned_2 := (CURRENT_TIMESTAMP + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;

          ELSIF lower(trim(NEW.order_type)) IN ('pre approval', 'pre-approval') THEN
              NEW.planned_1 := (CURRENT_TIMESTAMP + COALESCE(pre_approval_tat, INTERVAL '0'))::TEXT;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Function set_planned_by_order_type updated');

    console.log('\n✨ Trigger fix complete!');
    console.log('  - pre-approval orders → planned_1 = now + Pre Approval TAT');
    console.log('  - regular orders      → planned_2 = now + Approval of Order TAT');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTrigger();
