require('dotenv').config();
const db = require('./config/db');

async function debug() {
  try {
    const res = await db.query(`
      SELECT order_no 
      FROM order_dispatch 
      WHERE order_no LIKE 'DO-%' 
      ORDER BY order_no DESC 
      LIMIT 100
    `);
    console.log('--- Top 100 DO orders ---');
    console.log(res.rows.map(r => r.order_no));
    
    const maxLegacy = await db.query(`
      WITH legacy_orders AS (
        SELECT order_no,
               (substring(order_no from '^DO-(\\d+)')::integer) as num
        FROM order_dispatch
        WHERE order_no ~ '^DO-\\d+'
      )
      SELECT order_no, num FROM legacy_orders ORDER BY num DESC LIMIT 10
    `);
    console.log('\n--- Top 10 Legacy Numbers parsed ---');
    console.log(maxLegacy.rows);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

debug();
