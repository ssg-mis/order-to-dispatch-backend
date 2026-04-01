/**
 * Test script for conditional order number generation
 */

require('dotenv').config();
const db = require('./config/db');

async function testConditionalOrderNo() {
  const client = await db.getClient();
  try {
    console.log('--- Testing Conditional Order Number Generation ---');
    
    // 1. Test Legacy Format (Before April 1st, 2026)
    console.log('\nTesting Legacy Date: 2026-03-31');
    const resLegacy = await client.query(`
      INSERT INTO order_dispatch (
        customer_name, order_type, product_name, order_quantity, party_so_date
      ) VALUES (
        'Legacy Test', 'Regular', 'Product Old', 100, '2026-03-31'
      ) RETURNING order_no;
    `);
    console.log(`✅ Generated Legacy Order No: ${resLegacy.rows[0].order_no}`);
    
    if (/^DO-\d{3}[A-Z]$/.test(resLegacy.rows[0].order_no)) {
      console.log('✅ Legacy format correct (DO-XXXA)');
    } else {
      console.error('❌ Legacy format INCORRECT!');
    }

    // 2. Test New Format (On April 1st, 2026)
    console.log('\nTesting New Date: 2026-04-01');
    const resNew = await client.query(`
      INSERT INTO order_dispatch (
        customer_name, order_type, product_name, order_quantity, party_so_date
      ) VALUES (
        'New Test', 'Regular', 'Product New', 100, '2026-04-01'
      ) RETURNING order_no;
    `);
    console.log(`✅ Generated New Order No: ${resNew.rows[0].order_no}`);
    
    if (/^DO\/26-27\/\d{4}[A-Z]$/.test(resNew.rows[0].order_no)) {
      console.log('✅ New format correct (DO/26-27/XXXXA)');
    } else {
      console.error('❌ New format INCORRECT!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

testConditionalOrderNo();
