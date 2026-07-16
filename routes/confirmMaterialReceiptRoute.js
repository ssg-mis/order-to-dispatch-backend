/**
 * Confirm Material Receipt Routes (Gate 8) — v2 schema.
 * Operates on `material_receipts` (per shipment). :id = material_receipts row id.
 *   - Pending: material_receipts.planned_at NOT NULL, actual_at NULL
 *   - History: material_receipts.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const confirmMaterialReceiptController = require('../controllers/confirmMaterialReceiptController');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/confirm-receipt/pending */
router.get('/pending', confirmMaterialReceiptController.getPendingReceipts);

/** @route GET /api/v1/confirm-receipt/history */
router.get('/history', confirmMaterialReceiptController.getReceiptHistory);

/**
 * @route POST /api/v1/confirm-receipt/submit/:id   (:id = material_receipts row id)
 * @body  { materialReceivedDate?, receivedImageProof?, damageStatus?, damageQty?, damageImage?, remarks?, billAmount?, userId? }
 */
router.post('/submit/:id', confirmMaterialReceiptController.submitReceipt);

module.exports = router;
