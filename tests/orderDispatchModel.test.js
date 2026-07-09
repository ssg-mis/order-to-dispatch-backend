const test = require('node:test');
const assert = require('node:assert/strict');
const OrderDispatch = require('../models/orderDispatchModel');

test('maps frontend enum values to broker or salesperson fields', () => {
  const brokerOrder = new OrderDispatch({
    is_order_through: 'Broker',
    broker_name: 'Amit Broker',
    salesperson_name: 'Nishat Khan'
  });

  assert.equal(brokerOrder.is_order_through_broker, true);
  assert.equal(brokerOrder.broker_name, 'Amit Broker');
  assert.equal(brokerOrder.salesperson_name, null);
  assert.equal(brokerOrder.is_order_through, 'broker');

  const salespersonOrder = new OrderDispatch({
    is_order_through: 'Salesperson',
    salesperson_name: 'Nishat Khan',
    broker_name: 'Amit Broker'
  });

  assert.equal(salespersonOrder.is_order_through_broker, false);
  assert.equal(salespersonOrder.salesperson_name, 'Nishat Khan');
  assert.equal(salespersonOrder.broker_name, null);
  assert.equal(salespersonOrder.is_order_through, 'salesperson');
});
