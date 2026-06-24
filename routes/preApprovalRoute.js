/**
 * Pre-Approval Routes  
 * API endpoints for Stage 2: Pre-Approval workflow
 */

const express = require('express');
const router = express.Router();
const preApprovalController = require('../controllers/preApprovalController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

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
  pageAccess,
  preApprovalController.submitPreApproval
);

/**
 * @route   PATCH /api/v1/pre-approval/deduct-budget/:id
 * @desc    Deduct qty from an existing order without advancing it in the workflow.
 *          Sets planned_1 = NULL if qty reaches 0 (audit-only row).
 * @access  Public
 * @body    { order_quantity: number }
 */
router.patch(
  '/deduct-budget/:id',
  preApprovalController.deductBudget
);

/**
 * @route   POST /api/v1/pre-approval/submit-batch
 * @desc    Atomically submit approvals + cascade deductions in one transaction.
 * @access  Public
 * @body    { approvals: [{id, ...submissionData}], deductions: [{id, order_quantity}] }
 */
router.post(
  '/submit-batch',
  pageAccess,
  preApprovalController.submitBatch
);

module.exports = router;
