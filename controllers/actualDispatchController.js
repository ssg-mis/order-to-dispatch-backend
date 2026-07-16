/**
 * Actual Dispatch Controller (Gate 4: Actual Dispatch) — v2 schema.
 * :id on the mutating routes is a dispatch (shipment) id — the pending list is
 * per shipment. Bodies are camelCase.
 */

const actualDispatchService = require('../services/actualDispatchService');
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

const parseListFilters = (query) => {
  const { order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no } = query;
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
  return filters;
};

/**
 * Get pending actual dispatches
 * @route GET /api/v1/actual-dispatch/pending
 */
const getPendingDispatches = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await actualDispatchService.getPendingDispatches(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, { dispatches: result.data, pagination: result.pagination }, 'Pending actual dispatches fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingDispatches controller', error);
    next(error);
  }
};

/**
 * Get actual dispatch history
 * @route GET /api/v1/actual-dispatch/history
 */
const getDispatchHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await actualDispatchService.getDispatchHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, { dispatches: result.data, pagination: result.pagination }, 'Actual dispatch history fetched successfully');
  } catch (error) {
    Logger.error('Error in getDispatchHistory controller', error);
    next(error);
  }
};

/**
 * Get dynamic filter options (unique customer names) for Actual Dispatch
 * @route GET /api/v1/actual-dispatch/filters
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const result = await actualDispatchService.getFilterOptions();
    return ResponseUtil.success(res, result.data, 'Filter options fetched successfully');
  } catch (error) {
    Logger.error('Error in getFilterOptions controller', error);
    next(error);
  }
};

/**
 * Confirm an actual dispatch for a shipment
 * @route POST /api/v1/actual-dispatch/submit/:id   (:id = dispatch id)
 */
const submitActualDispatch = async (req, res, next) => {
  try {
    const dispatchId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[ACTUAL DISPATCH] Submit for dispatch ${dispatchId}`);
    const result = await actualDispatchService.submitActualDispatch(dispatchId, data);
    // WhatsApp next-stage notification intentionally not wired yet (see createOrder).
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[ACTUAL DISPATCH] Error in submitActualDispatch controller');
  }
};

/**
 * Revert an actual dispatch back to Pre-Approval
 * @route POST /api/v1/actual-dispatch/revert/:id   (:id = dispatch id)
 */
const revertActualDispatch = async (req, res, next) => {
  try {
    const dispatchId = parseInt(req.params.id, 10);
    const data = { remarks: req.body?.remarks, userId: req.body?.userId ?? req.user?.id ?? null };
    const result = await actualDispatchService.revertActualDispatch(dispatchId, data);
    return ResponseUtil.success(res, null, result.message);
  } catch (error) {
    handleError(res, next, error, '[ACTUAL DISPATCH] Error in revertActualDispatch controller');
  }
};

/**
 * Revert an actual dispatch one stage back to Dispatch Planning
 * @route POST /api/v1/actual-dispatch/revert-to-planning/:id   (:id = dispatch id)
 */
const revertToDispatchPlanning = async (req, res, next) => {
  try {
    const dispatchId = parseInt(req.params.id, 10);
    const data = { remarks: req.body?.remarks, userId: req.body?.userId ?? req.user?.id ?? null };
    const result = await actualDispatchService.revertToDispatchPlanning(dispatchId, data);
    return ResponseUtil.success(res, null, result.message);
  } catch (error) {
    handleError(res, next, error, '[ACTUAL DISPATCH] Error in revertToDispatchPlanning controller');
  }
};

/**
 * Cancel unselected Stock Transfer shipments from an Actual Dispatch batch
 * @route POST /api/v1/actual-dispatch/cancel-unselected
 * @body  { dispatchIds: number[] }
 */
const cancelUnselectedDispatches = async (req, res, next) => {
  try {
    const { dispatchIds } = req.body || {};
    const result = await actualDispatchService.cancelUnselectedDispatches(dispatchIds);
    return ResponseUtil.success(res, { cancelled: result.cancelled }, 'Unselected dispatches cancelled successfully');
  } catch (error) {
    handleError(res, next, error, '[ACTUAL DISPATCH] Error in cancelUnselectedDispatches controller');
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  getFilterOptions,
  submitActualDispatch,
  revertActualDispatch,
  revertToDispatchPlanning,
  cancelUnselectedDispatches,
};
