/**
 * Damage Adjustment Routes (Gate 9: Damage Adjustment — final) — v2 schema.
 * Operates on `damage_adjustments` (per shipment). :id = damage_adjustments row id.
 *   - Pending: damage_adjustments.planned_at NOT NULL, actual_at NULL
 *   - History: damage_adjustments.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const damageAdjustmentController = require('../controllers/damageAdjustmentController');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/damage-adjustment/pending */
router.get('/pending', damageAdjustmentController.getPendingAdjustments);

/** @route GET /api/v1/damage-adjustment/history */
router.get('/history', damageAdjustmentController.getAdjustmentHistory);

/**
 * @route POST /api/v1/damage-adjustment/submit/:id   (:id = damage_adjustments row id)
 * @body  { status?, creditNoteDate?, creditNoteNo?, creditNoteCopy?, creditNoteQty?, creditNoteAmount?, netBalance?, userId? }
 */
router.post('/submit/:id', damageAdjustmentController.submitAdjustment);

module.exports = router;
