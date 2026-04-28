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

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'lift_receiving_confirmation'
    `);
    console.log('Columns in lift_receiving_confirmation:');
    res.rows.forEach(row => console.log('- ' + row.column_name));
  } catch (err) {
    console.error('Error checking schema:', err);
  } finally {
    await pool.end();
  }
}

checkSchema();
