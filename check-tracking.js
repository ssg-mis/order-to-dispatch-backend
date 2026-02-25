
const db = require('./config/db');

async function checkTracking() {
  try {
    console.log('--- Most Recent Orders ---');
    const result = await db.query(`
      SELECT 
        order_no, 
        order_punch_user, 
        pre_approval_user, 
        order_approval_user, 
        dispatch_planning_user,
        actual_1,
        actual_2,
        actual_3,
        created_at
      FROM order_dispatch
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.table(result.rows);
    
    const users = await db.query(`SELECT id, username, role FROM login`);
    console.log('\n--- Registered Users ---');
    console.table(users.rows);

  } catch (err) {
    console.error('Error checking tracking:', err);
  } finally {
    process.exit();
  }
}

checkTracking();
