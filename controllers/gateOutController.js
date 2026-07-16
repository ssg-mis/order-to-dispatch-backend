/**
 * Gate Out Controller (Gate 7: Gate Out) — v2 schema.
 * :id on the mutating route is a gate_outs row id. Bodies are camelCase.
 */

const gateOutService = require('../services/gateOutService');
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
  const { order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number } = query;
  const filters = {
    order_no,
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
 * Get pending gate out records
 * @route GET /api/v1/gate-out/pending
 */
const getPendingGateOut = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await gateOutService.getPendingGateOut(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Pending gate out records fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingGateOut controller', error);
    next(error);
  }
};

/**
 * Get gate out history
 * @route GET /api/v1/gate-out/history
 */
const getGateOutHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await gateOutService.getGateOutHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Gate out history fetched successfully');
  } catch (error) {
    Logger.error('Error in getGateOutHistory controller', error);
    next(error);
  }
};

/**
 * Submit gate out
 * @route POST /api/v1/gate-out/submit/:id   (:id = gate_outs row id)
 * @body  { gatePassCopy?, vehicleLoadedImage?, userId? }
 */
const submitGateOut = async (req, res, next) => {
  try {
    const gateOutId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[GATE OUT] Submit for gate out ${gateOutId}`);
    const result = await gateOutService.submitGateOut(gateOutId, data);
    // WhatsApp next-stage notification intentionally not wired yet (see createOrder).
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[GATE OUT] Error in submitGateOut controller');
  }
};

module.exports = {
  getPendingGateOut,
  getGateOutHistory,
  submitGateOut,
};
