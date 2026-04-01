require('dotenv').config();
const db = require('./config/db');

async function findMax() {
  try {
    // We want to find the highest number in DO-XXX format.
    // We need to parse it as integer.
    const res = await db.query(`
      WITH legacy_orders AS (
        SELECT order_no,
               (substring(order_no from '^DO-(\\d+)')::integer) as num
        FROM order_dispatch
        WHERE order_no ~ '^DO-\\d+'
      )
      SELECT MAX(num) FROM legacy_orders
    `);
    
    console.log('--- Max Legacy Number ---');
    console.log(res.rows[0]);
    
    const resNew = await db.query(`
      WITH new_orders AS (
        SELECT order_no,
               (substring(order_no from '/(\\d+)$')::integer) as num
        FROM order_dispatch
        WHERE order_no ~ '^DO/\\d{2}-\\d{2}/\\d+'
      )
      SELECT MAX(num) FROM new_orders
    `);
    console.log('--- Max New Format Number ---');
    console.log(resNew.rows[0]);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

findMax();
