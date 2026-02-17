const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function fix() {
  const client = await pool.connect();
  try {
    console.log('Connected to database...');
    const res = await client.query('SELECT id, status, sku_code FROM sku_details');
    console.log(`Found ${res.rowCount} rows.`);

    let fixedCount = 0;
    const STATUSES = ['Active', 'Inactive'];

    for (const row of res.rows) {
      const { id, status, sku_code } = row;

      // Condition: status is NOT valid (e.g. it's a SKU code) AND sku_code IS valid (e.g. 'Active'/'Inactive')
      // Note: We should be careful about 'Active'/'Inactive' case sensitivity, but usually it's Title Case.
      // Also, SKU codes usually don't look like 'Active'.
      
      const isStatusValid = STATUSES.includes(status);
      const isSkuCodeStatus = STATUSES.includes(sku_code);

      if (!isStatusValid && isSkuCodeStatus) {
        console.log(`Fixing row ${id}: status="${status}", sku_code="${sku_code}" -> SWAPPING`);
        
        // Swap them
        await client.query(
          'UPDATE sku_details SET status = $1, sku_code = $2 WHERE id = $3',
          [sku_code, status, id]
        );
        fixedCount++;
      }
    }

    console.log(`Fixed ${fixedCount} rows.`);

  } catch (err) {
    console.error('Error executing fix:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fix();
