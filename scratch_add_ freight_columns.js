const { Pool } = require('pg');

const config = {
  host: 'database-1.c5om42i2ygos.ap-south-1.rds.amazonaws.com',
  user: 'postgres',
  password: 'Shrishyam001122',
  database: 'order-to-dispatch',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = new Pool(config);

async function addColumns() {
  try {
    console.log('Adding columns to lift_receiving_confirmation...');
    await pool.query(`
      ALTER TABLE lift_receiving_confirmation 
      ADD COLUMN IF NOT EXISTS freight_rate_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS freight_amount NUMERIC(12,2)
    `);
    console.log('Columns added successfully.');
  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    await pool.end();
  }
}

addColumns();
