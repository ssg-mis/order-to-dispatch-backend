/**
 * Pre-Approval Routes  
 * API endpoints for Stage 2: Pre-Approval workflow
 */

const express = require('express');
const router = express.Router();
const preApprovalController = require('../controllers/preApprovalController');

/**
 * @route   GET /api/v1/pre-approval/pending
 * @desc    Get pending pre-approval orders (planned_1 NOT NULL, actual_1 NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/pending',
  preApprovalController.getPendingPreApprovals
);

/**
 * @route   GET /api/v1/pre-approval/history
 * @desc    Get pre-approval history (planned_1 NOT NULL, actual_1 NOT NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/history',
  preApprovalController.getPreApprovalHistory
);

/**
 * @route   POST /api/v1/pre-approval/submit/:id
 * @desc    Submit pre-approval (sets actual_1 to current timestamp)
 * @access  Public
 * @body    Optional: any additional fields to update
 */
router.post(
  '/submit/:id',
  preApprovalController.submitPreApproval
);

module.exports = router;
