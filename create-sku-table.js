
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS sku_details (
  id SERIAL PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Active',
  sku_code VARCHAR(100) UNIQUE NOT NULL,
  sku_name VARCHAR(255) NOT NULL,
  main_uom VARCHAR(50),
  alternate_uom VARCHAR(50),
  nos_per_main_uom NUMERIC(10, 2),
  units VARCHAR(50),
  oil_filling_per_unit NUMERIC(10, 4),
  filling_units VARCHAR(50),
  converted_kg NUMERIC(10, 4),
  packing_weight_per_main_unit NUMERIC(10, 4),
  weight_difference NUMERIC(10, 4),
  sku_weight NUMERIC(10, 4),
  packing_weight NUMERIC(10, 4),
  gross_weight NUMERIC(10, 4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const run = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to database');
    await client.query(createTableQuery);
    console.log('Table sku_details created successfully');
    client.release();
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    pool.end();
  }
};

run();
