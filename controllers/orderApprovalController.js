/**
 * Order Approval Controller (Gate 2: Approval of Order) — v2 schema.
 * The pending list is per order_item, so :id on submit/get is an order_item id.
 */
const orderApprovalService = require('../services/orderApprovalService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get pending approval orders
 * @route GET /api/v1/approval/pending
 */
const getPendingApprovals = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date } = req.query;

    const filters = { order_no, customer_name, start_date, end_date };
    Object.keys(filters).forEach(key => { if (!filters[key]) delete filters[key]; });

    const result = await orderApprovalService.getPendingApprovals(filters, { page, limit });

    return ResponseUtil.success(
      res,
      { orders: result.data, pagination: result.pagination },
      'Pending approvals fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPendingApprovals controller', error);
    next(error);
  }
};

/**
 * Get approval history
 * @route GET /api/v1/approval/history
 */
const getApprovalHistory = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date } = req.query;

    const filters = { order_no, customer_name, start_date, end_date };
    Object.keys(filters).forEach(key => { if (!filters[key]) delete filters[key]; });

    const result = await orderApprovalService.getApprovalHistory(filters, { page, limit });

    return ResponseUtil.success(
      res,
      { orders: result.data, pagination: result.pagination },
      'Approval history fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getApprovalHistory controller', error);
    next(error);
  }
};

/**
 * Submit approval for an order item
 * @route POST /api/v1/approval/submit/:id   (:id = order_item id)
 */
const submitApproval = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    Logger.info(`Submitting order approval for order_item ID: ${orderItemId}`);

    // Fall back to the authenticated JWT user so the audit trail is never
    // null just because a caller forgot/misnamed userId in the body.
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    const result = await orderApprovalService.submitApproval(orderItemId, data);

    // WhatsApp next-stage notification intentionally not wired yet (see createOrder).
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    if (error.code === 'STALE_WRITE') {
      return ResponseUtil.error(res, error.message, 409);
    }
    if (error.message && error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    Logger.error('Error in submitApproval controller', error);
    next(error);
  }
};

/**
 * Get approval by order_item id
 * @route GET /api/v1/approval/:id
 */
const getApprovalById = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const result = await orderApprovalService.getApprovalById(orderItemId);
    return ResponseUtil.success(res, result.data, 'Approval fetched successfully');
  } catch (error) {
    if (error.message && error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    Logger.error('Error in getApprovalById controller', error);
    next(error);
  }
};

/**
 * Get dynamic filter options for the Approval stage
 * @route GET /api/v1/approval/filters
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const result = await orderApprovalService.getFilterOptions();
    return ResponseUtil.success(res, result.data, 'Filter options fetched successfully');
  } catch (error) {
    Logger.error('Error in getFilterOptions controller', error);
    next(error);
  }
};

module.exports = {
  getPendingApprovals,
  getApprovalHistory,
  submitApproval,
  getApprovalById,
  getFilterOptions,
};
