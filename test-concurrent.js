/**
 * Test Concurrent Order Submissions
 * Tests that multiple simultaneous order submissions get unique order numbers
 */

const axios = require('axios');

const API_URL = 'http://localhost:5001/api/v1/orders';

/**
 * Create a single order
 */
async function createOrder(userId) {
  const orderData = {
    customer_name: `Concurrent Test User ${userId}`,
    order_type: 'regular',
    customer_type: 'new',
    order_type_delivery_purpose: 'future-period',
    delivery_date: new Date().toISOString().split('T')[0],
    products: [
      {
        product_name: `Test Product ${userId}`,
        uom: 'Ltr',
        order_quantity: 100 + userId,
        rate_of_material: 150.50
      }
    ]
  };

  const startTime = Date.now();
  
  try {
    const response = await axios.post(API_URL, orderData);
    const duration = Date.now() - startTime;
    
    console.log(`✅ User ${userId.toString().padStart(2, '0')}: ${response.data.data.order_no} (${duration}ms)`);
    return {
      userId,
      orderNo: response.data.data.order_no,
      success: true,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ User ${userId.toString().padStart(2, '0')}: FAILED - ${error.response?.data?.message || error.message} (${duration}ms)`);
    return {
      userId,
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Test concurrent submissions
 */
async function testConcurrent(numUsers = 10) {
  console.log('\n==========================================');
  console.log('🧪 CONCURRENT ORDER SUBMISSION TEST');
  console.log('==========================================\n');
  console.log(`Simulating ${numUsers} users submitting orders simultaneously...\n`);
  
  const startTime = Date.now();
  
  // Create all promises at once to maximize concurrency
  const promises = [];
  for (let i = 1; i <= numUsers; i++) {
    promises.push(createOrder(i));
  }
  
  // Execute all simultaneously
  const results = await Promise.all(promises);
  
  const totalDuration = Date.now() - startTime;
  
  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const orderNumbers = successful.map(r => r.orderNo);
  const uniqueOrderNumbers = new Set(orderNumbers);
  
  console.log('\n==========================================');
  console.log('📊 TEST RESULTS');
  console.log('==========================================\n');
  console.log(`Total Requests:       ${numUsers}`);
  console.log(`Successful:           ${successful.length} ✅`);
  console.log(`Failed:               ${failed.length} ${failed.length > 0 ? '❌' : '✅'}`);
  console.log(`Unique Order Numbers: ${uniqueOrderNumbers.size} ${uniqueOrderNumbers.size === successful.length ? '✅' : '❌ DUPLICATE DETECTED!'}`);
  console.log(`Total Duration:       ${totalDuration}ms`);
  console.log(`Avg Duration:         ${Math.round(totalDuration / numUsers)}ms`);
  
  if (uniqueOrderNumbers.size !== successful.length) {
    console.log('\n⚠️  WARNING: DUPLICATE ORDER NUMBERS DETECTED!');
    console.log('Order Numbers:', orderNumbers.sort());
  } else {
    console.log('\n✅ SUCCESS: All order numbers are unique!');
    console.log('Order Numbers:', Array.from(uniqueOrderNumbers).sort());
  }
  
  console.log('\n==========================================\n');
}

// Run test with 20 concurrent users
testConcurrent(20)
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
