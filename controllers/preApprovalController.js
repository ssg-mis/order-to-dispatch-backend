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
        stage: `✅ *Pre-Approval Completed*`,
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

module.exports = {
  getPendingPreApprovals,
  getPreApprovalHistory,
  submitPreApproval
};
