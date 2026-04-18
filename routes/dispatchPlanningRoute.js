/**
 * Dispatch Planning Routes  
 * API endpoints for Stage 4: Dispatch Planning workflow
 * Conditions:
 * - Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
 * - History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
 */

const express = require('express');
const router = express.Router();
const dispatchPlanningController = require('../controllers/dispatchPlanningController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

/**
 * @route   GET /api/v1/dispatch-planning/pending
 * @desc    Get pending dispatch planning orders (planned_3 NOT NULL, actual_3 NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/pending',
  dispatchPlanningController.getPendingDispatches
);

/**
 * @route   GET /api/v1/dispatch-planning/history
 * @desc    Get dispatch planning history (planned_3 NOT NULL, actual_3 NOT NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/history',
  dispatchPlanningController.getDispatchHistory
);

/**
 * @route   POST /api/v1/dispatch-planning/submit/:id
 * @desc    Submit dispatch planning (inserts into lift_receiving_confirmation, sets actual_3)
 * @access  Public
 * @body    { dispatch_from: string }
 */
router.post(
  '/submit/:id',
  pageAccess,
  dispatchPlanningController.submitDispatchPlanning
);

/**
 * @route   POST /api/v1/dispatch-planning/revert/:id
 * @desc    Revert dispatch planning to pre-approval (nulls actual_3, planned_3, actual_2, planned_2, actual_1)
 * @access  Public
 * @body    { username: string }
 */
router.post(
  '/revert/:id',
  dispatchPlanningController.revertDispatchPlanning
);

/**
 * @route   POST /api/v1/dispatch-planning/update-transfer/:id
 * @desc    Update transfer details for an order
 * @access  Public
 * @body    { transfer: string, bill_company_name: string, ... }
 */
router.post(
  '/update-transfer/:id',
  dispatchPlanningController.updateTransferDetails
);

/**
 * @route   POST /api/v1/dispatch-planning/preclose/:id
 * @desc    Pre-close quantity for an order
 * @access  Public
 * @body    { preclose_qty: number, username: string }
 */
router.post(
  '/preclose/:id',
  dispatchPlanningController.precloseDispatchPlanning
);

module.exports = router;
