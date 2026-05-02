require('dotenv').config();
const db = require('./config/db');

async function fixTrigger() {
  try {
    console.log('🚀 Removing legacy planned_3 trigger...');

    await db.query(`DROP TRIGGER IF EXISTS trg_set_planned_3 ON order_dispatch`);
    console.log('✅ Trigger trg_set_planned_3 removed');

    console.log('\n✨ Approval submit now owns planned_3 TAT calculation.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing database trigger:', error);
    process.exit(1);
  }
}

fixTrigger();
