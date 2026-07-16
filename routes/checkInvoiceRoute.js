/**
 * Check Invoice Routes (Gate 6b: Check Invoice) — v2 schema.
 * Operates on the Check sub-gate of `invoices`. :id = invoices row id.
 *   - Pending: invoices.planned_checked_at NOT NULL, checked_at NULL, (made_at NOT NULL OR status='Issue')
 *   - History: invoices.planned_checked_at NOT NULL, checked_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const checkInvoiceController = require('../controllers/checkInvoiceController');
const checkInvoiceValidator = require('../validators/checkInvoiceValidator');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/check-invoice/pending */
router.get('/pending', checkInvoiceController.getPendingInvoices);

/** @route GET /api/v1/check-invoice/history */
router.get('/history', checkInvoiceController.getCheckHistory);

/**
 * @route POST /api/v1/check-invoice/submit/:id   (:id = invoices row id)
 * @body  { status?: 'Issue'|<verified>, remarks?, userId? }
 */
router.post('/submit/:id', checkInvoiceValidator.validateSubmit, checkInvoiceController.submitCheck);

module.exports = router;
