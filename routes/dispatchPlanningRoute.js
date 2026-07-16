/**
 * Dispatch Planning Routes (Gate 3: Dispatch Planning) — v2 schema.
 * :id on the mutating routes is an order_item id.
 *   - Pending: dispatch_plannings.planned_at NOT NULL, actual_at NULL
 *   - History: dispatch_plannings.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const dispatchPlanningController = require('../controllers/dispatchPlanningController');
const dispatchPlanningValidator = require('../validators/dispatchPlanningValidator');
// pageAccess middleware (WhatsApp notification targeting, reads legacy `login`
// table on prod RDS) intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/dispatch-planning/pending */
router.get('/pending', dispatchPlanningController.getPendingDispatches);

/** @route GET /api/v1/dispatch-planning/history */
router.get('/history', dispatchPlanningController.getDispatchHistory);

/**
 * @route POST /api/v1/dispatch-planning/submit/:id   (:id = order_item id)
 * @body  { dispatchQty?, transfer?, dispatchFrom?, billCompanyName?, billAddress?,
 *          shipCompanyName?, shipAddress?, freightRate?, userId? }
 */
router.post('/submit/:id', dispatchPlanningValidator.validateSubmit, dispatchPlanningController.submitDispatchPlanning);

/**
 * @route POST /api/v1/dispatch-planning/revert/:id   (:id = order_item id)
 * @body  { remarks?, userId? }
 */
router.post('/revert/:id', dispatchPlanningController.revertDispatchPlanning);

/**
 * @route POST /api/v1/dispatch-planning/cancel/:id   (:id = order_item id) — Super Admin only
 * @body  { remarks, userId? }
 */
router.post('/cancel/:id', dispatchPlanningController.cancelDispatchPlanning);

/**
 * @route POST /api/v1/dispatch-planning/update-transfer/:id   (:id = order_item id)
 * @body  { billCompanyName?, billAddress?, shipCompanyName?, shipAddress?, freightRate? }
 */
router.post('/update-transfer/:id', dispatchPlanningController.updateTransferDetails);

/**
 * @route POST /api/v1/dispatch-planning/preclose/:id   (:id = order_item id)
 * @body  { precloseQty, action?, precloseRemarks?, userId? }
 */
router.post('/preclose/:id', dispatchPlanningValidator.validatePreclose, dispatchPlanningController.precloseDispatchPlanning);

module.exports = router;
