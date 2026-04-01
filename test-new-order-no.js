/**
 * Test script for new order number generation format
 */

require('dotenv').config();
const db = require('./config/db');

async function testOrderNo() {
  const client = await db.getClient();
  try {
    console.log('--- Testing Order Number Generation ---');
    
    // Simulate current date as April 1st, 2026 for FY 26-27 testing
    // The trigger will use the actual DB CURRENT_TIMESTAMP, 
    // but today is April 1st, 2026 according to the system prompt!
    
    const insertQuery = `
      INSERT INTO order_dispatch (
        customer_name, order_type, product_name, order_quantity, order_punch_user
      ) VALUES (
        'Test Customer FY Change', 'Regular', 'Test Product', 100, 'test_user'
      ) RETURNING order_no, created_at;
    `;
    
    console.log('Inserting test order...');
    const result = await client.query(insertQuery);
    const orderNo = result.rows[0].order_no;
    const createdAt = result.rows[0].created_at;
    
    console.log(`✅ Generated Order No: ${orderNo}`);
    console.log(`   Created At: ${createdAt}`);
    
    if (/^DO\/26-27\/\d{4}[A-Z]$/.test(orderNo)) {
      console.log('✅ Matches expected format: DO/26-27/XXXX[A-Z]');
    } else {
      console.error('❌ Does NOT match expected format!');
    }

    // Test multi-product batch (same transaction)
    console.log('\n--- Testing Multi-product Batch ---');
    await client.query('BEGIN');
    
    const res1 = await client.query(`
      INSERT INTO order_dispatch (customer_name, order_type, product_name, order_quantity) 
      VALUES ('Multi Test', 'Regular', 'Product A', 50) RETURNING order_no
    `);
    const res2 = await client.query(`
      INSERT INTO order_dispatch (customer_name, order_type, product_name, order_quantity) 
      VALUES ('Multi Test', 'Regular', 'Product B', 50) RETURNING order_no
    `);
    
    await client.query('COMMIT');
    
    console.log(`✅ Product A Order No: ${res1.rows[0].order_no}`); // Should be DO/26-27/XXXXA
    console.log(`✅ Product B Order No: ${res2.rows[0].order_no}`); // Should be DO/26-27/XXXXB
    
    const baseA = res1.rows[0].order_no.slice(0, -1);
    const baseB = res2.rows[0].order_no.slice(0, -1);
    
    if (baseA === baseB && res1.rows[0].order_no.endsWith('A') && res2.rows[0].order_no.endsWith('B')) {
      console.log('✅ Batch serial letters working correctly!');
    } else {
      console.error('❌ Batch serial letters FAILED!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

testOrderNo();
