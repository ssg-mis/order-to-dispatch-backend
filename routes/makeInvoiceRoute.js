/**
 * Make Invoice Routes (Gate 6a: Make Invoice) — v2 schema.
 * Operates on the Make sub-gate of `invoices`. :id = invoices row id.
 *   - Pending: invoices.planned_made_at NOT NULL, made_at NULL
 *   - History: invoices.planned_made_at NOT NULL, made_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const makeInvoiceController = require('../controllers/makeInvoiceController');
const makeInvoiceValidator = require('../validators/makeInvoiceValidator');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/make-invoice/pending */
router.get('/pending', makeInvoiceController.getPendingInvoices);

/** @route GET /api/v1/make-invoice/history */
router.get('/history', makeInvoiceController.getInvoiceHistory);

/**
 * @route POST /api/v1/make-invoice/submit/:id   (:id = invoices row id)
 * @body  { billType?, invoiceDate?, invoiceNo?, invoiceCopy?, qty?, billAmount?, cdAmount?, userId? }
 */
router.post('/submit/:id', makeInvoiceValidator.validateSubmit, makeInvoiceController.submitInvoice);

/** @route GET /api/v1/make-invoice/:id   (:id = invoices row id) — keep last */
router.get('/:id', makeInvoiceController.getInvoiceById);

module.exports = router;
