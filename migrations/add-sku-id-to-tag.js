/**
 * Migration: add sku_id column to tag table
 * Run once: node migrations/add-sku-id-to-tag.js
 */
const pool = require('../config/db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE tag
        ADD COLUMN IF NOT EXISTS sku_id INTEGER;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tag_sku_id_unique
        ON tag (sku_id)
        WHERE sku_id IS NOT NULL;
    `);
    console.log('Migration complete: sku_id column added to tag table.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
