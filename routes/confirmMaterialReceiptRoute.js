const express = require('express');
const router = express.Router();
const confirmMaterialReceiptController = require('../controllers/confirmMaterialReceiptController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

// Get pending records
router.get('/pending', confirmMaterialReceiptController.getPendingReceipts);

// Get history
router.get('/history', confirmMaterialReceiptController.getReceiptHistory);

// Submit receipt
router.post('/submit/:id', pageAccess, confirmMaterialReceiptController.submitReceipt);

module.exports = router;
