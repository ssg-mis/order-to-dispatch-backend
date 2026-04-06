const service = require('./services/orderApprovalService');
const fields = service.getApprovalFields();
console.log('Fields:', fields);
if (fields.includes('order_category')) {
  console.log('SUCCESS: order_category found in fields list.');
} else {
  console.log('FAILURE: order_category NOT found in fields list.');
  process.exit(1);
}
