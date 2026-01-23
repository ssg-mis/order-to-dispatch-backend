const express = require('express');
const router = express.Router();
const confirmMaterialReceiptController = require('../controllers/confirmMaterialReceiptController');

// Get pending records
router.get('/pending', confirmMaterialReceiptController.getPendingReceipts);

// Get history
router.get('/history', confirmMaterialReceiptController.getReceiptHistory);

// Submit receipt
router.post('/submit/:id', confirmMaterialReceiptController.submitReceipt);

module.exports = router;
