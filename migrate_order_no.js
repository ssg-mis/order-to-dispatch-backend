
const { Client } = require('pg');
require('dotenv').config({ path: '/home/vikaschoudhary/Documents/order_dispatch_working/backend/order-to-dispatch-backend/.env' });

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Update commitment_details where order_no is null
    // We'll try to find matching rows in order_dispatch
    const query = `
      UPDATE commitment_details cd
      SET order_no = sub.order_no
      FROM (
        SELECT od.order_no, od.customer_name, od.party_so_date, od.product_name, od.order_quantity
        FROM order_dispatch od
        WHERE od.order_no LIKE 'DO/%'
      ) sub
      WHERE cd.order_no IS NULL
      AND cd.sku = sub.product_name
      AND cd.sku_quantity = sub.order_quantity
      AND sub.customer_name = (SELECT party_name FROM commitment_main WHERE id = cd.commitment_id)
      AND sub.party_so_date = (SELECT commitment_date FROM commitment_main WHERE id = cd.commitment_id)
    `;

    const res = await client.query(query);
    console.log(`Updated ${res.rowCount} existing rows in commitment_details`);

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

migrate();
