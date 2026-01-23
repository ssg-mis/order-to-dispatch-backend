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
  dispatchPlanningController.submitDispatchPlanning
);

module.exports = router;
