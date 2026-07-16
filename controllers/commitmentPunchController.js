/**
 * Commitment Punch Controller — v2 schema. Bodies are camelCase.
 *   - /:id/process spawns a real order (orders + order_items) pending Order Approval.
 */

const commitmentPunchService = require('../services/commitmentPunchService');
const { ResponseUtil, Logger } = require('../utils');

const handleError = (res, next, error, ctx) => {
  if (error.code === 'STALE_WRITE' || error.statusCode === 409) {
    return ResponseUtil.error(res, error.message, 409);
  }
  if (error.message && error.message.includes('not found')) {
    return ResponseUtil.notFound(res, error.message);
  }
  // Validation-style errors (qty <= 0, exceeds balance, missing sku) → 422.
  if (error.message && (error.message.includes('must be') || error.message.includes('exceeds') || error.message.includes('required'))) {
    return ResponseUtil.error(res, error.message, 422);
  }
  Logger.error(ctx, error);
  next(error);
};

/**
 * @route POST /api/v1/commitment-punch
 * @body  { rows?: [{oilType, quantity, unit, rate}], customerId, commitmentDate,
 *          customerContactPersonName?, whatsappNo?, address?, oilType?, quantity?, unit?, rate? }
 */
const createCommitment = async (req, res, next) => {
  try {
    const { rows, ...data } = req.body || {};
    const result = await commitmentPunchService.createCommitment(data, rows || []);
    return ResponseUtil.success(res, result.data, result.message, 201);
  } catch (error) {
    handleError(res, next, error, '[COMMITMENT] Error in createCommitment controller');
  }
};

/**
 * @route GET /api/v1/commitment-punch
 * @query page, limit, customer_name, search
 */
const getAll = async (req, res, next) => {
  try {
    const { page, limit, customer_name, search } = req.query;
    const result = await commitmentPunchService.getAll({ customer_name, search }, { page, limit });
    return ResponseUtil.success(res, { commitments: result.data, pagination: result.pagination }, 'Commitments fetched');
  } catch (error) {
    Logger.error('Error in getAll commitments controller', error);
    next(error);
  }
};

/**
 * @route GET /api/v1/commitment-punch/pending
 * @query page, limit, search
 */
const getPending = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const result = await commitmentPunchService.getPending({ search }, { page, limit });
    return ResponseUtil.success(res, { commitments: result.data, pagination: result.pagination }, 'Pending commitments fetched');
  } catch (error) {
    Logger.error('Error in getPending commitments controller', error);
    next(error);
  }
};

/**
 * @route GET /api/v1/commitment-punch/:id/details
 */
const getDetails = async (req, res, next) => {
  try {
    const commitmentId = parseInt(req.params.id, 10);
    const result = await commitmentPunchService.getDetails(commitmentId);
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[COMMITMENT] Error in getDetails controller');
  }
};

/**
 * @route PUT /api/v1/commitment-punch/:id/process
 * @body  { skuId, skuQuantity, skuRate?, poNo?, poDate?, orderType?, orderCategory?,
 *          depotId?, brokerId?, salespersonId?, deliveryPurpose?, orderThrough?,
 *          paymentTerms?, advancePaymentToBeTaken?, advanceAmount?, typeOfTransporting?,
 *          startDate?, endDate?, deliveryDate?, futurePeriodDate?, uploadCopy?, remarks?, userId? }
 */
const processCommitment = async (req, res, next) => {
  try {
    const commitmentId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[COMMITMENT] Process commitment ${commitmentId}`);
    const result = await commitmentPunchService.processCommitment(commitmentId, data);
    // WhatsApp next-stage notification intentionally not wired yet (see createOrder).
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[COMMITMENT] Error in processCommitment controller');
  }
};

module.exports = { createCommitment, getAll, getPending, processCommitment, getDetails };
