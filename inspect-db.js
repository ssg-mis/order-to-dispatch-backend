const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function inspectTable() {
  try {
    console.log('--- Inspecting Table: lift_receiving_confirmation ---');
    
    // 1. List all columns
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'lift_receiving_confirmation'
      ORDER BY ordinal_position
    `);
    console.log('\nColumns:');
    columns.rows.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));

    // 2. List all triggers
    const triggers = await db.query(`
      SELECT 
        tgname AS trigger_name,
        proname AS function_name,
        CASE tgtype::integer & 66
          WHEN 2 THEN 'BEFORE'
          WHEN 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END AS activation,
        CASE tgtype::integer & 28
          WHEN 4 THEN 'INSERT'
          WHEN 8 THEN 'DELETE'
          WHEN 16 THEN 'UPDATE'
          WHEN 20 THEN 'INSERT OR UPDATE'
          WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
        END AS event
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE tgrelid = 'lift_receiving_confirmation'::regclass
      AND tgisinternal = false
    `);
    console.log('\nTriggers:');
    triggers.rows.forEach(t => console.log(`- ${t.trigger_name} [${t.activation} ${t.event}] calling ${t.function_name}`));

    // 3. Inspect set_planned_dispatch function specifically if it exists
    try {
      const func = await db.query(`
        SELECT prosrc
        FROM pg_proc
        WHERE proname = 'set_planned_dispatch'
      `);
      if (func.rows.length > 0) {
        console.log('\nSource of function set_planned_dispatch:');
        console.log(func.rows[0].prosrc);
      }
    } catch (e) {}

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectTable();
