/**
 * Gate Out Routes (Gate 7: Gate Out) — v2 schema.
 * Operates on `gate_outs` (per shipment). :id = gate_outs row id.
 *   - Pending: gate_outs.planned_at NOT NULL, actual_at NULL
 *   - History: gate_outs.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const gateOutController = require('../controllers/gateOutController');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/gate-out/pending */
router.get('/pending', gateOutController.getPendingGateOut);

/** @route GET /api/v1/gate-out/history */
router.get('/history', gateOutController.getGateOutHistory);

/**
 * @route POST /api/v1/gate-out/submit/:id   (:id = gate_outs row id)
 * @body  { gatePassCopy?, vehicleLoadedImage?, userId? }
 */
router.post('/submit/:id', gateOutController.submitGateOut);

module.exports = router;
