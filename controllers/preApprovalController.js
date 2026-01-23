/**
 * Pre-Approval Controller
 * Handles HTTP requests for pre-approval workflow
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');

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
