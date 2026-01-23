/**
 * Actual Dispatch Controller
 * Handles HTTP requests for actual dispatch (Stage 5: Actual Dispatch)
 */

const actualDispatchService = require('../services/actualDispatchService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get pending actual dispatches
 * @route GET /api/v1/actual-dispatch/pending
 */
const getPendingDispatches = async (req, res, next) => {
  try {
    const { page, limit, d_sr_number, so_no, party_name, ...otherFilters } = req.query;
    
    const filters = {
      d_sr_number,
      so_no,
      party_name,
      ...otherFilters
    };
    
    // Remove undefined/null filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });
    
    Logger.info('Fetching pending actual dispatches', { filters, page, limit });
    
    const result = await actualDispatchService.getPendingDispatches(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        dispatches: result.data,
        pagination: result.pagination
      },
      'Pending actual dispatches fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getPendingDispatches controller', error);
    next(error);
  }
};

/**
 * Get actual dispatch history
 * @route GET /api/v1/actual-dispatch/history
 */
const getDispatchHistory = async (req, res, next) => {
  try {
    const { page, limit, d_sr_number, so_no, party_name, ...otherFilters } = req.query;
    
    const filters = {
      d_sr_number,
      so_no,
      party_name,
      ...otherFilters
    };
    
    // Remove undefined/null filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });
    
    Logger.info('Fetching actual dispatch history', { filters, page, limit });
    
    const result = await actualDispatchService.getDispatchHistory(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        dispatches: result.data,
        pagination: result.pagination
      },
      'Actual dispatch history fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getDispatchHistory controller', error);
    next(error);
  }
};

/**
 * Submit actual dispatch
 * @route POST /api/v1/actual-dispatch/submit/:dsrNumber
 */
const submitActualDispatch = async (req, res, next) => {
  try {
    const { dsrNumber } = req.params;
    const dispatchData = req.body;
    
    Logger.info(`[ACTUAL DISPATCH] Submitting for DSR: ${dsrNumber}`, { 
      params: req.params, 
      body: dispatchData
    });
    
    const result = await actualDispatchService.submitActualDispatch(dsrNumber, dispatchData);
    
    Logger.info(`[ACTUAL DISPATCH] Success for DSR: ${dsrNumber}`);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('[ACTUAL DISPATCH] Error in submitActualDispatch controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  submitActualDispatch
};
