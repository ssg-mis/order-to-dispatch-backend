const { Client } = require('pg');
const client = new Client({
  host: 'database-1.c5om42i2ygos.ap-south-1.rds.amazonaws.com',
  user: 'postgres',
  password: 'Shrishyam001122',
  database: 'order-to-dispatch',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});
client.connect().then(() => {
  return client.query("SELECT id, username, role, page_access, features FROM login");
}).then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(console.error);
