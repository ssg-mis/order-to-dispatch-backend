/**
 * Pre-Approval Controller
 * Handles HTTP requests for pre-approval workflow
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');
const { notifyNextStage } = require('../services/stageNotifier');

/**
 * Get pending pre-approval orders
 * @route GET /api/v1/pre-approval/pending
 */
const getPendingPreApprovals = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date } = req.query;

    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });

    const result = await orderDispatchService.getPendingPreApprovals(filters, { page, limit });

    return ResponseUtil.success(
      res,
      {
        orders: result.data,
        pagination: result.pagination
      },
      'Pending pre-approvals fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPendingPreApprovals controller', error);
    next(error);
  }
};

/**
 * Get pre-approval history  
 * @route GET /api/v1/pre-approval/history
 */
const getPreApprovalHistory = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date } = req.query;

    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });

    const result = await orderDispatchService.getPreApprovalHistory(filters, { page, limit });

    return ResponseUtil.success(
      res,
      {
        orders: result.data,
        pagination: result.pagination
      },
      'Pre-approval history fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPreApprovalHistory controller', error);
    next(error);
  }
};

/**
 * Submit pre-approval
 * @route POST /api/v1/pre-approval/submit/:id
 */
const submitPreApproval = async (req, res, next) => {
  try {
    // :id is the order_item id in v2 (the pending list is per order_item).
    const orderItemId = parseInt(req.params.id, 10);
    Logger.info(`Submitting pre-approval for order_item ID: ${orderItemId}`);

    // Fall back to the authenticated JWT user so the audit trail is never
    // null just because a caller forgot/misnamed userId in the body.
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    const result = await orderDispatchService.submitPreApproval(orderItemId, data);

    notifyNextStage({ orderItemId }, { targetPage: 'Approval of Order', userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    if (error.code === 'STALE_WRITE') {
      return ResponseUtil.error(res, error.message, 409);
    }
    if (error.message && error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    Logger.error('Error in submitPreApproval controller', error);
    next(error);
  }
};

/**
 * Deduct qty from an existing pending pre-approval order_item without advancing it.
 * @route PATCH /api/v1/pre-approval/deduct-budget/:id
 * @body { orderQuantity: number }
 */
const deductBudget = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const { orderQuantity } = req.body || {};

    if (orderQuantity === undefined || orderQuantity === null) {
      return ResponseUtil.error(res, 'orderQuantity is required', 400);
    }

    const result = await orderDispatchService.deductBudget(orderItemId, orderQuantity);
    return ResponseUtil.success(res, result, 'Budget deducted successfully');
  } catch (error) {
    if (error.message && error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    Logger.error('Error in deductBudget controller', error);
    next(error);
  }
};

/**
 * Atomically submit approvals + new SKU lines + cascade deductions in one transaction.
 * @route POST /api/v1/pre-approval/submit-batch
 * @body { approvals: [{id, ...data}], cascadeBudgets: [{base_do, oil_type, qty}], deductions?: [{id, orderQuantity}], skipIds?: number[], newItems?: [{orderId, skuId, uom, oilType, orderQuantity, rateOfMaterial, ratePerLtr, ratePer15kg}] }
 */
const submitBatch = async (req, res, next) => {
  try {
    const { approvals = [], cascadeBudgets = [], deductions = [], skipIds = [], newItems = [] } = req.body || {};

    if (!Array.isArray(approvals) || !Array.isArray(cascadeBudgets) || !Array.isArray(newItems)) {
      return ResponseUtil.error(res, 'approvals, cascadeBudgets and newItems must be arrays', 400);
    }

    Logger.info(`[BATCH] Submitting ${approvals.length} approvals, ${newItems.length} new SKU lines, ${cascadeBudgets.length} cascade budgets, ${skipIds.length} skipped (auto-close)`);

    // Fall back to the authenticated JWT user so the audit trail is never null
    // just because a caller forgot/misnamed userId in the body.
    const fallbackUserId = req.user?.id ?? null;
    const result = await orderDispatchService.submitBatch(
      approvals.map(({ id, userId, ...data }) => ({ id, data: { ...data, userId: userId ?? fallbackUserId } })),
      cascadeBudgets,
      deductions,
      skipIds,
      newItems
    );

    return ResponseUtil.success(res, result, 'Batch submitted successfully');
  } catch (error) {
    if (error.code === 'STALE_WRITE') {
      return ResponseUtil.error(res, error.message, 409);
    }
    if (error.message && (error.message.includes('not found') || error.message.includes('New SKU line'))) {
      return ResponseUtil.error(res, error.message, 400);
    }
    Logger.error('Error in submitBatch controller', error);
    next(error);
  }
};

module.exports = {
  getPendingPreApprovals,
  getPreApprovalHistory,
  submitPreApproval,
  deductBudget,
  submitBatch
};
