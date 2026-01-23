/**
 * Dispatch Planning Controller
 * Handles HTTP requests for dispatch planning (Stage 4: Dispatch Planning)
 */

const dispatchPlanningService = require('../services/dispatchPlanningService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get pending dispatch planning orders
 * @route GET /api/v1/dispatch-planning/pending
 */
const getPendingDispatches = async (req, res, next) => {
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
    
    Logger.info('Fetching pending dispatches', { filters, page, limit });
    
    const result = await dispatchPlanningService.getPendingDispatches(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        dispatches: result.data,
        pagination: result.pagination
      },
      'Pending dispatches fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPendingDispatches controller', error);
    next(error);
  }
};

/**
 * Get dispatch planning history
 * @route GET /api/v1/dispatch-planning/history
 */
const getDispatchHistory = async (req, res, next) => {
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
    
    Logger.info('Fetching dispatch history', { filters, page, limit });
    
    const result = await dispatchPlanningService.getDispatchHistory(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        dispatches: result.data,
        pagination: result.pagination
      },
      'Dispatch history fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getDispatchHistory controller', error);
    next(error);
  }
};

/**
 * Submit dispatch planning
 * @route POST /api/v1/dispatch-planning/submit/:id
 */
const submitDispatchPlanning = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dispatchData = req.body;
    
    Logger.info(`[DISPATCH PLANNING] Submitting for order ID: ${id}`, { 
      params: req.params, 
      body: dispatchData
    });
    
    const result = await dispatchPlanningService.submitDispatchPlanning(id, dispatchData);
    
    Logger.info(`[DISPATCH PLANNING] Success for order ID: ${id}`);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('[DISPATCH PLANNING] Error in submitDispatchPlanning controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  submitDispatchPlanning
};
