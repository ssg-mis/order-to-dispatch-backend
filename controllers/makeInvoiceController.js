/**
 * Make Invoice Controller (Gate 6a: Make Invoice) — v2 schema.
 * :id on the mutating/detail routes is an invoices row id. Bodies are camelCase.
 */

const makeInvoiceService = require('../services/makeInvoiceService');
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
 * Get pending invoices (awaiting Make Invoice)
 * @route GET /api/v1/make-invoice/pending
 */
const getPendingInvoices = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await makeInvoiceService.getPendingInvoices(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Pending invoices fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingInvoices controller', error);
    next(error);
  }
};

/**
 * Get invoice history (Make Invoice completed)
 * @route GET /api/v1/make-invoice/history
 */
const getInvoiceHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await makeInvoiceService.getInvoiceHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Invoice history fetched successfully');
  } catch (error) {
    Logger.error('Error in getInvoiceHistory controller', error);
    next(error);
  }
};

/**
 * Submit (make) an invoice
 * @route POST /api/v1/make-invoice/submit/:id   (:id = invoices row id)
 * @body  { billType?, invoiceDate?, invoiceNo?, invoiceCopy?, qty?, billAmount?, cdAmount?, userId? }
 */
const submitInvoice = async (req, res, next) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[MAKE INVOICE] Submit for invoice ${invoiceId}`);
    const result = await makeInvoiceService.submitInvoice(invoiceId, data);
    notifyNextStage({ dispatchId: result.data?.dispatchId }, { userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[MAKE INVOICE] Error in submitInvoice controller');
  }
};

/**
 * Get an invoice by id
 * @route GET /api/v1/make-invoice/:id   (:id = invoices row id)
 */
const getInvoiceById = async (req, res, next) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const result = await makeInvoiceService.getInvoiceById(invoiceId);
    return ResponseUtil.success(res, result.data, 'Invoice fetched successfully');
  } catch (error) {
    handleError(res, next, error, '[MAKE INVOICE] Error in getInvoiceById controller');
  }
};

module.exports = {
  getPendingInvoices,
  getInvoiceHistory,
  submitInvoice,
  getInvoiceById,
};
