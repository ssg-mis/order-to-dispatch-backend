require('dotenv').config();
const db = require('./config/db');

async function inspectTriggers() {
  try {
    console.log('Inspecting triggers on order_dispatch...');
    const result = await db.query(`
      SELECT 
          trig.tgname AS trigger_name,
          proc.proname AS function_name,
          proc.prosrc AS function_definition
      FROM pg_trigger trig
      JOIN pg_class cls ON trig.tgrelid = cls.oid
      JOIN pg_proc proc ON trig.tgfoid = proc.oid
      WHERE cls.relname = 'order_dispatch';
    `);

    console.log('Found', result.rows.length, 'triggers:');
    result.rows.forEach(row => {
      console.log('---');
      console.log('Trigger:', row.trigger_name);
      console.log('Function:', row.function_name);
      if (row.function_definition.includes('check_1')) {
        console.log('!!! CONTAINS check_1 !!!');
      }
      console.log('Definition:\n', row.function_definition);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error inspecting triggers:', error);
    process.exit(1);
  }
}

inspectTriggers();
