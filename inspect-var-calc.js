const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function inspectVarCalc() {
  try {
    console.log('--- Inspecting var_calc table for Jan 2026 ---');
    
    const result = await db.query(`
      SELECT id, oil_type, calculation_date, gt
      FROM var_calc
      WHERE calculation_date >= '2026-01-01' AND calculation_date <= '2026-01-31'
      ORDER BY calculation_date DESC, id DESC
    `);
    
    console.log('\nRecords found:');
    result.rows.forEach(r => {
      console.log(`- ID: ${r.id}, Oil Type: ${r.oil_type}, Date: ${r.calculation_date}, GT: ${r.gt}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectVarCalc();
