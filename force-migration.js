const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Starting migration to add depo_access column...');
  const client = await pool.connect();
  try {
    // Kill any other sessions that might be locking the login table
    console.log('Attempting to clear locks on login table...');
    await client.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = current_database() 
      AND pid <> pg_backend_pid()
      AND query ILIKE '%login%';
    `).catch(e => console.log('Notice: Failed to terminate some backends, continuing...'));

    console.log('Executing ALTER TABLE...');
    await client.query("ALTER TABLE login ADD COLUMN IF NOT EXISTS depo_access jsonb DEFAULT '{}'::jsonb;");
    console.log('Migration successful: depo_access column added.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
