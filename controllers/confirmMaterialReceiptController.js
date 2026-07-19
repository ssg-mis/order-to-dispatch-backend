/**
 * Confirm Material Receipt Controller (Gate 8) — v2 schema.
 * :id on the mutating route is a material_receipts row id. Bodies are camelCase.
 */

const confirmMaterialReceiptService = require('../services/confirmMaterialReceiptService');
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
 * Get pending material receipts
 * @route GET /api/v1/confirm-receipt/pending
 */
const getPendingReceipts = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await confirmMaterialReceiptService.getPendingReceipts(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Pending material receipts fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingReceipts controller', error);
    next(error);
  }
};

/**
 * Get material receipt history
 * @route GET /api/v1/confirm-receipt/history
 */
const getReceiptHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await confirmMaterialReceiptService.getReceiptHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, result.data, 'Material receipt history fetched successfully');
  } catch (error) {
    Logger.error('Error in getReceiptHistory controller', error);
    next(error);
  }
};

/**
 * Submit a material receipt
 * @route POST /api/v1/confirm-receipt/submit/:id   (:id = material_receipts row id)
 * @body  { materialReceivedDate?, receivedImageProof?, damageStatus?, damageQty?,
 *          damageImage?, remarks?, billAmount?, userId? }
 */
const submitReceipt = async (req, res, next) => {
  try {
    const materialReceiptId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[MATERIAL RECEIPT] Submit for receipt ${materialReceiptId}`);
    const result = await confirmMaterialReceiptService.submitReceipt(materialReceiptId, data);
    // Auto-resolves to Damage Adjustment only when the receipt flagged damage; otherwise nothing is pending (no nudge).
    notifyNextStage({ dispatchId: result.data?.dispatchId }, { userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[MATERIAL RECEIPT] Error in submitReceipt controller');
  }
};

module.exports = {
  getPendingReceipts,
  getReceiptHistory,
  submitReceipt,
};
