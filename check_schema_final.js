const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function checkColumns() {
  try {
    const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lift_receiving_confirmation'");
    const columns = res.rows.map(r => r.column_name).sort();
    console.log('Columns in lift_receiving_confirmation:');
    columns.forEach(c => console.log(`- ${c}`));
    
    // Check for specific suspicious columns
    const suspicious = ['rto', 'road_tax', 'registration_no', 'vehicle_type', 'passing_weight', 'difference', 'vehicle_overload_remarks', 'freight_rate_type', 'freight_amount'];
    console.log('\nChecking for specific columns:');
    suspicious.forEach(s => {
       console.log(`${s}: ${columns.includes(s) ? 'EXISTS' : 'MISSING'}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkColumns();
