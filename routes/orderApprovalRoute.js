/**
 * Order Approval Routes  
 * API endpoints for Stage 3: Order Approval workflow
 * Conditions:
 * - Pending: planned_2 IS NOT NULL AND actual_2 IS NULL
 * - History: planned_2 IS NOT NULL AND actual_2 IS NOT NULL
 */

const express = require('express');
const router = express.Router();
const orderApprovalController = require('../controllers/orderApprovalController');

/**
 * @route   GET /api/v1/approval/pending
 * @desc    Get pending approval orders (planned_2 NOT NULL, actual_2 NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/pending',
  orderApprovalController.getPendingApprovals
);

/**
 * @route   GET /api/v1/approval/history
 * @desc    Get approval history (planned_2 NOT NULL, actual_2 NOT NULL)
 * @access  Public
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get(
  '/history',
  orderApprovalController.getApprovalHistory
);

/**
 * @route   GET /api/v1/approval/:id
 * @desc    Get approval by order ID
 * @access  Public
 */
router.get(
  '/:id',
  orderApprovalController.getApprovalById
);

/**
 * @route   POST /api/v1/approval/submit/:id
 * @desc    Submit approval (sets actual_2 to current timestamp)
 * @access  Public
 * @body    Optional: any additional fields to update
 */
router.post(
  '/submit/:id',
  orderApprovalController.submitApproval
);

module.exports = router;
