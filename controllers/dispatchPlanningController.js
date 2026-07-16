/**
 * Dispatch Planning Controller (Gate 3: Dispatch Planning) — v2 schema.
 * :id on the mutating routes is an order_item id (the pending list is per item).
 */

const dispatchPlanningService = require('../services/dispatchPlanningService');
const { ResponseUtil, Logger } = require('../utils');

const handleError = (res, next, error, ctx) => {
  if (error.code === 'STALE_WRITE' || error.statusCode === 409) {
    return ResponseUtil.error(res, error.message, 409);
  }
  if (error.message && error.message.includes('not found')) {
    return ResponseUtil.notFound(res, error.message);
  }
  Logger.error(ctx, error);
  next(error);
};

/**
 * Get pending dispatch planning items
 * @route GET /api/v1/dispatch-planning/pending
 */
const getPendingDispatches = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no } = req.query;

    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      manual_sauda_no,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined')
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === '' ? [] : depo_names.split(',')))
        : undefined,
    };
    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
    });

    const result = await dispatchPlanningService.getPendingDispatches(filters, { page, limit });
    return ResponseUtil.success(res, { dispatches: result.data, pagination: result.pagination }, 'Pending dispatches fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingDispatches controller', error);
    next(error);
  }
};

/**
 * Get dispatch planning history
 * @route GET /api/v1/dispatch-planning/history
 */
const getDispatchHistory = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no } = req.query;

    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      manual_sauda_no,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined')
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === '' ? [] : depo_names.split(',')))
        : undefined,
    };
    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
    });

    const result = await dispatchPlanningService.getDispatchHistory(filters, { page, limit });
    return ResponseUtil.success(res, { dispatches: result.data, pagination: result.pagination }, 'Dispatch history fetched successfully');
  } catch (error) {
    Logger.error('Error in getDispatchHistory controller', error);
    next(error);
  }
};

/**
 * Submit dispatch planning for an order item
 * @route POST /api/v1/dispatch-planning/submit/:id   (:id = order_item id)
 */
const submitDispatchPlanning = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[DISPATCH PLANNING] Submit for order_item ${orderItemId}`);
    const result = await dispatchPlanningService.submitDispatchPlanning(orderItemId, data);
    // WhatsApp next-stage notification intentionally not wired yet (see createOrder).
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[DISPATCH PLANNING] Error in submitDispatchPlanning controller');
  }
};

/**
 * Revert dispatch planning back to Pre-Approval
 * @route POST /api/v1/dispatch-planning/revert/:id   (:id = order_item id)
 */
const revertDispatchPlanning = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const data = { remarks: req.body?.remarks, userId: req.body?.userId ?? req.user?.id ?? null };
    const result = await dispatchPlanningService.revertDispatchPlanning(orderItemId, data);
    return ResponseUtil.success(res, null, result.message);
  } catch (error) {
    handleError(res, next, error, '[DISPATCH PLANNING] Error in revertDispatchPlanning controller');
  }
};

/**
 * Cancel an item from Dispatch Planning — Super Admin only
 * @route POST /api/v1/dispatch-planning/cancel/:id   (:id = order_item id)
 */
const cancelDispatchPlanning = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const { remarks } = req.body;

    if (req.user?.role !== 'super_admin') {
      return ResponseUtil.error(res, 'Only Super Admin can cancel a Dispatch Planning order', 403);
    }
    if (!remarks || !String(remarks).trim()) {
      return ResponseUtil.error(res, 'Cancellation remarks are required', 400);
    }

    const result = await dispatchPlanningService.cancelDispatchPlanning(orderItemId, { remarks, userId: req.body?.userId ?? req.user?.id ?? null });
    return ResponseUtil.success(res, null, result.message);
  } catch (error) {
    handleError(res, next, error, '[DISPATCH PLANNING] Error in cancelDispatchPlanning controller');
  }
};

/**
 * Update transfer details on the order header
 * @route POST /api/v1/dispatch-planning/update-transfer/:id   (:id = order_item id)
 */
const updateTransferDetails = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const result = await dispatchPlanningService.updateTransferDetails(orderItemId, req.body || {});
    return ResponseUtil.success(res, null, result.message);
  } catch (error) {
    handleError(res, next, error, '[DISPATCH PLANNING] Error in updateTransferDetails controller');
  }
};

/**
 * Pre-close quantity for an order item
 * @route POST /api/v1/dispatch-planning/preclose/:id   (:id = order_item id)
 */
const precloseDispatchPlanning = async (req, res, next) => {
  try {
    const orderItemId = parseInt(req.params.id, 10);
    const { precloseQty, action, precloseRemarks } = req.body;
    const result = await dispatchPlanningService.precloseDispatchPlanning(orderItemId, {
      precloseQty,
      action,
      precloseRemarks,
      userId: req.body?.userId ?? req.user?.id ?? null,
    });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[DISPATCH PLANNING] Error in precloseDispatchPlanning controller');
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  submitDispatchPlanning,
  revertDispatchPlanning,
  cancelDispatchPlanning,
  updateTransferDetails,
  precloseDispatchPlanning,
};
