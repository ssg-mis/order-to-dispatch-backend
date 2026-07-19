/**
 * Check Invoice Controller (Gate 6b: Check Invoice) — v2 schema.
 * :id on the mutating route is an invoices row id. Bodies are camelCase.
 */

const checkInvoiceService = require('../services/checkInvoiceService');
const { ResponseUtil, Logger } = require('../utils');
const { notifyNextStage } = require('../services/stageNotifier');

const handleError = (res, next, error, ctx) => {
  if (error.code === 'STALE_WRITE' || error.statusCode === 409) {
    return ResponseUtil.error(res, error.message, 409);
  }
  if (error.message && error.message.includes('not found')) {
    return ResponseUtil.notFound(res, error.message);
  }
  if (error.message && error.message.includes('cannot be verified')) {
    return ResponseUtil.error(res, error.message, 422);
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
 * Get pending invoices (awaiting Check Invoice)
 * @route GET /api/v1/check-invoice/pending
 */
const getPendingInvoices = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await checkInvoiceService.getPendingInvoices(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Pending check invoices fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingInvoices controller', error);
    next(error);
  }
};

/**
 * Get check invoice history
 * @route GET /api/v1/check-invoice/history
 */
const getCheckHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await checkInvoiceService.getCheckHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Check invoice history fetched successfully');
  } catch (error) {
    Logger.error('Error in getCheckHistory controller', error);
    next(error);
  }
};

/**
 * Submit a check-invoice verdict
 * @route POST /api/v1/check-invoice/submit/:id   (:id = invoices row id)
 * @body  { status?: 'Issue'|<verified>, remarks?, userId? }
 */
const submitCheck = async (req, res, next) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[CHECK INVOICE] Submit for invoice ${invoiceId}`, { status: data.status });
    const result = await checkInvoiceService.submitCheck(invoiceId, data);
    // Live gates decide: verified -> Gate Out (BANARI) or Confirm Material Receipt; issue -> Make Invoice.
    notifyNextStage({ dispatchId: result.data?.dispatchId }, { userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[CHECK INVOICE] Error in submitCheck controller');
  }
};

module.exports = {
  getPendingInvoices,
  getCheckHistory,
  submitCheck,
};
