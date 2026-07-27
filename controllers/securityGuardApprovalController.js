/**
 * Security Guard Approval Controller (Gate 5: Security Guard Approval) — v2 schema.
 * :id on the mutating/detail routes is a security_guard_checks (attempt) id.
 * Bodies are camelCase.
 */

const securityGuardApprovalService = require('../services/securityGuardApprovalService');
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
  const { order_no, search, customer_name, start_date, end_date, depo_names, manual_sauda_no } = query;
  const filters = {
    // `search` is the generic search-box param sent by the frontend shell;
    // `order_no` already matches against both order no. and customer name.
    order_no: order_no || search,
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
 * Get pending security guard approvals
 * @route GET /api/v1/security-approval/pending
 */
const getPendingApprovals = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await securityGuardApprovalService.getPendingApprovals(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, { approvals: result.data, pagination: result.pagination }, 'Pending security guard approvals fetched successfully');
  } catch (error) {
    Logger.error('Error in getPendingApprovals controller', error);
    next(error);
  }
};

/**
 * Get security guard approval history
 * @route GET /api/v1/security-approval/history
 */
const getApprovalHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await securityGuardApprovalService.getApprovalHistory(parseListFilters(req.query), { page, limit });
    return ResponseUtil.success(res, { approvals: result.data, pagination: result.pagination }, 'Security guard approval history fetched successfully');
  } catch (error) {
    Logger.error('Error in getApprovalHistory controller', error);
    next(error);
  }
};

/**
 * Get security guard filter options (unique customers + depots)
 * @route GET /api/v1/security-approval/filters
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const result = await securityGuardApprovalService.getFilterOptions();
    return ResponseUtil.success(res, result.data, 'Filter options fetched successfully');
  } catch (error) {
    Logger.error('Error in getFilterOptions controller', error);
    next(error);
  }
};

/**
 * Submit a security guard verdict
 * @route POST /api/v1/security-approval/submit/:id   (:id = security_guard_checks id)
 * @body  { verdictStatus: 'APPROVE'|'REJECT', biltyNo?, biltyImage?, vehicleImageAttachment?, remarks?, userId? }
 */
const submitApproval = async (req, res, next) => {
  try {
    const securityCheckId = parseInt(req.params.id, 10);
    const data = { ...req.body, userId: req.body?.userId ?? req.user?.id ?? null };
    Logger.info(`[SECURITY] Submit for security check ${securityCheckId}`, { verdict: data.verdictStatus });
    const result = await securityGuardApprovalService.submitApproval(securityCheckId, data);
    // Live gates decide the target: APPROVE -> Make Invoice, REJECT -> back to Actual Dispatch.
    notifyNextStage({ dispatchId: result.data?.dispatchId }, { userId: data.userId });
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    handleError(res, next, error, '[SECURITY] Error in submitApproval controller');
  }
};

/**
 * Get a security guard approval by id
 * @route GET /api/v1/security-approval/:id   (:id = security_guard_checks id)
 */
const getApprovalById = async (req, res, next) => {
  try {
    const securityCheckId = parseInt(req.params.id, 10);
    const result = await securityGuardApprovalService.getApprovalById(securityCheckId);
    return ResponseUtil.success(res, result.data, 'Security guard approval fetched successfully');
  } catch (error) {
    handleError(res, next, error, '[SECURITY] Error in getApprovalById controller');
  }
};

module.exports = {
  getPendingApprovals,
  getApprovalHistory,
  getFilterOptions,
  submitApproval,
  getApprovalById,
};
