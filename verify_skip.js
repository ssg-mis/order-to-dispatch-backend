const service = require('./services/orderApprovalService');
const db = require('./config/db');

// Mocking function
function createMockFn(impl) {
  const fn = async (...args) => {
    fn.mock.calls.push(args);
    return impl(...args);
  };
  fn.mock = { calls: [] };
  return fn;
}

const jest = { fn: createMockFn };

// Mocking some methods for the test
const mockClient = {
  query: jest.fn(async (text, params) => {
    console.log('--- MOCK QUERY ---');
    console.log('Query:', text.substring(0, 100) + '...');
    if (text.includes('UPDATE order_dispatch') && text.includes('SET actual_2')) {
      return { rows: [{ id: 1, overall_status_of_order: true, order_no: 'DO-TEST-001', customer_name: 'Test Customer', product_name: 'Test Product', approval_qty: 100, type_of_transporting: 'Road' }] };
    }
    if (text.includes('UPDATE order_dispatch') && text.includes('actual_3 = NOW()')) {
      return { rows: [{ id: 1, order_no: 'DO-TEST-001', customer_name: 'Test Customer', product_name: 'Test Product', remaining_dispatch_qty: 100, type_of_transporting: 'Road' }] };
    }
    if (text.includes("nextval('dsr_number_seq')")) {
      return { rows: [{ val: 123 }] };
    }
    if (text.includes('INSERT INTO lift_receiving_confirmation')) {
      return { rows: [{ id: 999 }] };
    }
    return { rows: [] };
  }),
  release: jest.fn(async () => { console.log('Client released'); })
};

db.getClient = jest.fn(async () => mockClient);

async function testSkip() {
  console.log('Starting verification of Stage 4 skip...');
  try {
    const result = await service.submitApproval(1, { username: 'testuser', overall_status_of_order: true });
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Verify queries
    const queries = mockClient.query.mock.calls.map(call => call[0]);
    console.log('Queries executed count:', queries.length);
    
    const hasBegin = queries.some(q => q === 'BEGIN');
    const hasCommit = queries.some(q => q === 'COMMIT');
    const hasLrcInsert = queries.some(q => q.includes('INSERT INTO lift_receiving_confirmation'));
    const hasStage4Update = queries.some(q => q.includes('actual_3 = NOW()') && q.includes('planned_3 = NULL'));

    console.log('Checks:', { hasBegin, hasCommit, hasLrcInsert, hasStage4Update });

    if (hasBegin && hasCommit && hasLrcInsert && hasStage4Update) {
      console.log('SUCCESS: All expected queries were executed.');
    } else {
      console.log('FAILURE: Missing queries.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test threw error:', err);
    process.exit(1);
  }
}

testSkip().catch(err => {
    console.error('Unhandled rejections:', err);
    process.exit(1);
});
