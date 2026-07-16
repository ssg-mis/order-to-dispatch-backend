/**
 * Order Approval Routes (Gate 2: Approval of Order) — v2 schema.
 * :id is an order_item id (the pending list is per order_item).
 *   - Pending: order_approvals.planned_at NOT NULL, actual_at NULL
 *   - History: order_approvals.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const orderApprovalController = require('../controllers/orderApprovalController');
const orderApprovalValidator = require('../validators/orderApprovalValidator');
// pageAccess middleware (WhatsApp notification targeting, reads legacy `login`
// table on prod RDS) intentionally not applied until the notification layer is migrated.

/**
 * @route   GET /api/v1/approval/pending
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get('/pending', orderApprovalController.getPendingApprovals);

/**
 * @route   GET /api/v1/approval/history
 * @query   page, limit, order_no, customer_name, start_date, end_date
 */
router.get('/history', orderApprovalController.getApprovalHistory);

/**
 * @route   GET /api/v1/approval/filters
 * @desc    Unique filter options (customer names) for the approval stage
 */
router.get('/filters', orderApprovalController.getFilterOptions);

/**
 * @route   GET /api/v1/approval/:id   (:id = order_item id)
 */
router.get('/:id', orderApprovalController.getApprovalById);

/**
 * @route   POST /api/v1/approval/submit/:id   (:id = order_item id)
 * @body    { overallStatus, rateIsRightlyAsPerCurrentMarketRate, weAreDealingInOrderedSku,
 *            partyCreditStatus, dispatchDateConfirmed, orderConfirmationWithCustomer,
 *            processId?, userId? }
 */
router.post(
  '/submit/:id',
  orderApprovalValidator.validateSubmit,
  orderApprovalController.submitApproval
);

module.exports = router;
