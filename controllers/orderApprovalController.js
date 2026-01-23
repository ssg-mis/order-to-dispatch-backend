/**
 * Order Approval Controller
 * Handles HTTP requests for order approval (Stage 3: Approval)
 */

const orderApprovalService = require('../services/orderApprovalService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get pending approval orders
 * @route GET /api/v1/approval/pending
 */
const getPendingApprovals = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date, ...otherFilters } = req.query;
    
    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      ...otherFilters
    };
    
    // Remove undefined/null filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });
    
    Logger.info('Fetching pending approvals', { filters, page, limit });
    
    const result = await orderApprovalService.getPendingApprovals(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        orders: result.data,
        pagination: result.pagination
      },
      'Pending approvals fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPendingApprovals controller', error);
    next(error);
  }
};

/**
 * Get approval history
 * @route GET /api/v1/approval/history
 */
const getApprovalHistory = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date, ...otherFilters } = req.query;
    
    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      ...otherFilters
    };
    
    // Remove undefined/null filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });
    
    Logger.info('Fetching approval history', { filters, page, limit });
    
    const result = await orderApprovalService.getApprovalHistory(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        orders: result.data,
        pagination: result.pagination
      },
      'Approval history fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getApprovalHistory controller', error);
    next(error);
  }
};

/**
 * Submit approval for an order
 * @route POST /api/v1/approval/submit/:id
 */
const submitApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const additionalData = req.body;
    
    Logger.info(`[SUBMIT APPROVAL] Received request for ID: ${id}`, { 
      params: req.params, 
      body: additionalData,
      headers: { 
        'content-type': req.headers['content-type'],
        'origin': req.headers['origin']
      }
    });
    
    const result = await orderApprovalService.submitApproval(id, additionalData);
    
    Logger.info(`[SUBMIT APPROVAL] Success for ID: ${id}`);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('[SUBMIT APPROVAL] Error in submitApproval controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Get approval by order ID
 * @route GET /api/v1/approval/:id
 */
const getApprovalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    Logger.info(`Fetching approval for order ID: ${id}`);
    
    const result = await orderApprovalService.getApprovalById(id);
    
    return ResponseUtil.success(
      res,
      result.data,
      'Approval fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getApprovalById controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  getPendingApprovals,
  getApprovalHistory,
  submitApproval,
  getApprovalById
};
