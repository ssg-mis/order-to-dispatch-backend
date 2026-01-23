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
 * @route   GET /api/v1/actual-dispatch/history
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
  actualDispatchController.submitActualDispatch
);

module.exports = router;
