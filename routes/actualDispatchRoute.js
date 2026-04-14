/**
 * Actual Dispatch Routes  
 * API endpoints for Stage 5: Actual Dispatch workflow
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_1 IS NOT NULL AND actual_1 IS NULL
 * - History: planned_1 IS NOT NULL AND actual_1 IS NOT NULL
 */

const express = require('express');
const router = express.Router();
const actualDispatchController = require('../controllers/actualDispatchController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

/**
 * @route   GET /api/v1/actual-dispatch/pending
 * @desc    Get pending actual dispatches (planned_1 NOT NULL, actual_1 NULL)
 * @access  Public
 * @query   page, limit, d_sr_number, so_no, party_name
 */
router.get(
  '/pending',
  actualDispatchController.getPendingDispatches
);

/**
 * @route   GET /api/v1/actual-dispatch/filters
 * @desc    Get dynamic filter options (unique party names)
 * @access  Public
 */
router.get(
  '/filters',
  actualDispatchController.getFilterOptions
);

/**
 * @desc    Get actual dispatch history (planned_1 NOT NULL, actual_1 NOT NULL)
 * @access  Public
 * @query   page, limit, d_sr_number, so_no, party_name
 */
router.get(
  '/history',
  actualDispatchController.getDispatchHistory
);

/**
 * @route   POST /api/v1/actual-dispatch/submit/:dsrNumber
 * @desc    Submit actual dispatch (updates actual_1 and related fields)
 * @access  Public
 * @body    { product_name_1, actual_qty_dispatch, ... }
 */
router.post(
  '/submit/:dsrNumber',
  pageAccess,
  actualDispatchController.submitActualDispatch
);

/**
 * @route   POST /api/v1/actual-dispatch/revert/:dsrNumber
 * @desc    Revert actual dispatch (removes from list and restores quantity)
 * @access  Public
 * @body    { username }
 */
router.post(
  '/revert/:dsrNumber',
  actualDispatchController.revertActualDispatch
);

module.exports = router;
