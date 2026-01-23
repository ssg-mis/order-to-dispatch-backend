const express = require('express');
const router = express.Router();
const makeInvoiceController = require('../controllers/makeInvoiceController');

// Get pending invoices
router.get('/pending', makeInvoiceController.getPendingInvoices);

// Get invoice history
router.get('/history', makeInvoiceController.getInvoiceHistory);

// Submit invoice (update actual_5 and invoice fields)
router.post('/submit/:id', makeInvoiceController.submitInvoice);

// Get invoice details by ID
router.get('/:id', makeInvoiceController.getInvoiceById);

module.exports = router;
