/**
 * Pre-Approval Controller
 * Handles HTTP requests for pre-approval workflow
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

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
    const { id } = req.params;
    const additionalData = req.body || {};

    Logger.info(`Submitting pre-approval for order ID: ${id}`);

    const result = await orderDispatchService.submitPreApproval(id, additionalData);

    // Trigger WhatsApp notifications for the next stage: Approval of Order
    try {
      const docDetails = {
        stage: `✅ *Pre-Approval Completed*\n📍 *Pending in Approval of Order*`,
        order_type: result.data.approved?.order_type,
        do_date: result.data.approved?.delivery_date,
        do_number: result.data.approved?.order_no,
        customer_name: result.data.approved?.customer_name,
        oil_type: result.data.approved?.oil_type,
        rate_15_kg: result.data.approved?.rate_per_15kg,
        rate_1_ltr: result.data.approved?.rate_per_ltr,
        order_punch_remarks: result.data.approved?.order_punch_remarks
      };

      if (req.pageAccessDetails) {
        await whatsappShareService(docDetails, req.pageAccessDetails, 'Approval of Order');
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for pre-approval submission', notifyError);
    }

    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('Error in submitPreApproval controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Deduct budget from an existing order without advancing it in the workflow.
 * @route PATCH /api/v1/pre-approval/deduct-budget/:id
 */
const deductBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { order_quantity } = req.body;

    if (order_quantity === undefined || order_quantity === null) {
      return res.status(400).json({ success: false, message: 'order_quantity is required' });
    }

    Logger.info(`Deducting budget for order ID: ${id}, new qty: ${order_quantity}`);

    const result = await orderDispatchService.deductBudget(id, order_quantity);

    return ResponseUtil.success(res, result, 'Budget deducted successfully');
  } catch (error) {
    Logger.error('Error in deductBudget controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Atomically submit approvals + cascade deductions in one transaction.
 * @route POST /api/v1/pre-approval/submit-batch
 * @body  { approvals: [{id, ...data}], cascadeBudgets: [{base_do, oil_type, qty}], deductions?: [{id, order_quantity}] }
 */
const submitBatch = async (req, res, next) => {
  try {
    const { approvals = [], cascadeBudgets = [], deductions = [], skipIds = [] } = req.body;

    if (!Array.isArray(approvals) || !Array.isArray(cascadeBudgets)) {
      return res.status(400).json({ success: false, message: 'approvals and cascadeBudgets must be arrays' });
    }

    Logger.info(`[BATCH] Submitting ${approvals.length} approvals, ${cascadeBudgets.length} cascade budgets, ${skipIds.length} skipped (auto-close)`);

    const result = await orderDispatchService.submitBatch(
      approvals.map(({ id, ...data }) => ({ id, data })),
      cascadeBudgets,
      deductions,
      skipIds
    );

    return ResponseUtil.success(res, result, 'Batch submitted successfully');
  } catch (error) {
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
