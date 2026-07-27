/**
 * Damage Adjustment Controller (Gate 9: Damage Adjustment — final) — v2 schema.
 * :id on the mutating route is a damage_adjustments row id. Bodies are camelCase.
 */

const damageAdjustmentService = require('../services/damageAdjustmentService');
const { ResponseUtil, Logger } = require('../utils');
const { notifyNextStage } = require('../services/stageNotifier');

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
  const { order_no, search, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number } = query;
  const filters = {
    // `search` is the generic search-box param sent by the frontend shell;
    // `order_no` already matches against both order no. and customer name.
    order_no: order_no || search,
    customer_name,
    start_date,
    end_date,
    manual_sauda_no,
    d_sr_number,
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
 * Get pending damage adjustments
 * @route GET /api/v1/damage-adjustment/pending
 */
const getPendingAdjustments = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await damageAdjustmentService.getPendingAdjustments(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Pending damage adjustments fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingAdjustments controller', error);
    next(error);
  }
};

/**
 * Get damage adjustment history
 * @route GET /api/v1/damage-adjustment/history
 */
const getAdjustmentHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await damageAdjustmentService.getAdjustmentHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Damage adjustment history fetched successfully');
  } catch (error) {
    Logger.error('Error in getAdjustmentHistory controller', error);
    next(error);
  }
};

/**
 * Submit a damage adjustment (final gate)
 * @route POST /api/v1/damage-adjustment/submit/:id   (:id = damage_adjustments row id)
 * @body  { status?, creditNoteDate?, creditNoteNo?, creditNoteCopy?, creditNoteQty?, creditNoteAmount?, netBalance?, userId? }
 */
const submitAdjustment = async (req, res, next) => {
  try {
    const damageAdjustmentId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[DAMAGE ADJUSTMENT] Submit for adjustment ${damageAdjustmentId}`);
    const result = await damageAdjustmentService.submitAdjustment(damageAdjustmentId, data);
    // Final stage — nudge the Dashboard watchers that the order is fully complete.
    notifyNextStage({ dispatchId: result.data?.dispatchId }, { targetPage: 'Dashboard', userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[DAMAGE ADJUSTMENT] Error in submitAdjustment controller');
  }
};

module.exports = {
  getPendingAdjustments,
  getAdjustmentHistory,
  submitAdjustment,
};
