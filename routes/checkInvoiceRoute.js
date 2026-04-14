const express = require('express');
const router = express.Router();
const checkInvoiceController = require('../controllers/checkInvoiceController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

// Get pending invoices for checking
router.get('/pending', checkInvoiceController.getPendingInvoices);

// Get check history
router.get('/history', checkInvoiceController.getCheckHistory);

// Submit check (update status/remarks)
router.post('/submit/:id', pageAccess, checkInvoiceController.submitCheck);

module.exports = router;
