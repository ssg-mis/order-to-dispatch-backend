const express = require('express');
const router = express.Router();
const checkInvoiceController = require('../controllers/checkInvoiceController');

// Get pending invoices for checking
router.get('/pending', checkInvoiceController.getPendingInvoices);

// Get check history
router.get('/history', checkInvoiceController.getCheckHistory);

// Submit check (update status/remarks)
router.post('/submit/:id', checkInvoiceController.submitCheck);

module.exports = router;
