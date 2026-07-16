/**
 * Actual Dispatch Routes (Gate 4: Actual Dispatch) — v2 schema.
 * Operates on `dispatches` (shipments). :id on the mutating routes is a dispatch id.
 *   - Pending: dispatches.planned_at NOT NULL, actual_at NULL
 *   - History: dispatches.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const actualDispatchController = require('../controllers/actualDispatchController');
const actualDispatchValidator = require('../validators/actualDispatchValidator');
// pageAccess middleware (WhatsApp notification targeting, reads legacy `login`
// table on prod RDS) intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/actual-dispatch/pending */
router.get('/pending', actualDispatchController.getPendingDispatches);

/** @route GET /api/v1/actual-dispatch/filters */
router.get('/filters', actualDispatchController.getFilterOptions);

/** @route GET /api/v1/actual-dispatch/history */
router.get('/history', actualDispatchController.getDispatchHistory);

/**
 * @route POST /api/v1/actual-dispatch/submit/:id   (:id = dispatch id)
 * @body  { actualDispatchDate?, actualQtyDispatch?, actualQty?, vehicleId?|registrationNo?,
 *          driverId?|drivingLicenceNo?|driverName?, transporterId?|transporterName?,
 *          <doc images + end dates>, <weights>, <freight/bhada>, checkStatus?, remarks?, userId? }
 */
router.post('/submit/:id', actualDispatchValidator.validateSubmit, actualDispatchController.submitActualDispatch);

/**
 * @route POST /api/v1/actual-dispatch/revert/:id   (:id = dispatch id) — back to Pre-Approval
 * @body  { remarks?, userId? }
 */
router.post('/revert/:id', actualDispatchController.revertActualDispatch);

/**
 * @route POST /api/v1/actual-dispatch/revert-to-planning/:id   (:id = dispatch id) — one stage back
 * @body  { remarks?, userId? }
 */
router.post('/revert-to-planning/:id', actualDispatchController.revertToDispatchPlanning);

/**
 * @route POST /api/v1/actual-dispatch/cancel-unselected
 * @body  { dispatchIds: number[] } — drops unselected Stock Transfer shipments
 */
router.post('/cancel-unselected', actualDispatchController.cancelUnselectedDispatches);

module.exports = router;
