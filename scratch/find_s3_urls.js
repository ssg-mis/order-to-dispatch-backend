const db = require('./config/db');

async function findLogo() {
  try {
    const res = await db.query("SELECT * FROM order_dispatch WHERE upload_so IS NOT NULL LIMIT 5");
    console.log("Sample S3 URLs:", res.rows.map(r => r.upload_so));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

findLogo();
