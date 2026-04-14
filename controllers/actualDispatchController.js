/**
 * Actual Dispatch Controller
 * Handles HTTP requests for actual dispatch (Stage 5: Actual Dispatch)
 */

const actualDispatchService = require('../services/actualDispatchService');
const { ResponseUtil, Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

/**
 * Get pending actual dispatches
 * @route GET /api/v1/actual-dispatch/pending
 */
const getPendingDispatches = async (req, res, next) => {
  try {
    const { page, limit, search, party_name, depo_names, ...otherFilters } = req.query;
    
    const filters = {
      search,
      customer_name: party_name,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined') 
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === "" ? [] : depo_names.split(','))) 
        : undefined,
      ...otherFilters
    };
    
    // Remove only undefined/null filters (keep empty arrays for strict access)
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
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
    const { page, limit, search, party_name, depo_names, ...otherFilters } = req.query;
    
    const filters = {
      search,
      customer_name: party_name,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined') 
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === "" ? [] : depo_names.split(','))) 
        : undefined,
      ...otherFilters
    };
    
    // Remove only undefined/null filters (keep empty arrays for strict access)
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
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
    
    // Trigger WhatsApp notification for the next stage
    try {
      if (result.success && result.data && result.data.so_no) {
        const docDetails = {
          stage: `🚚 *Actual Dispatch Completed*\n📍 *Pending in Vehicle Details*`,
          do_number: result.data.so_no
        };
        if (req.pageAccessDetails) {
          await whatsappShareService(docDetails, req.pageAccessDetails, 'Vehicle Details');
        }
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for Actual Dispatch', notifyError);
    }
    
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

/**
 * Revert actual dispatch
 * @route POST /api/v1/actual-dispatch/revert/:dsrNumber
 */
const revertActualDispatch = async (req, res, next) => {
  try {
    const { dsrNumber } = req.params;
    const { username, remarks } = req.body;
    
    Logger.info(`[ACTUAL DISPATCH] Reverting DSR: ${dsrNumber}`, { username, remarks });
    
    const result = await actualDispatchService.revertActualDispatch(dsrNumber, username, remarks);
    
    return ResponseUtil.success(
      res,
      null,
      result.message
    );
  } catch (error) {
    Logger.error('[ACTUAL DISPATCH] Error in revertActualDispatch controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Get dynamic filter options for Actual Dispatch stage
 * @route GET /api/v1/actual-dispatch/filters
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const result = await actualDispatchService.getFilterOptions();
    return ResponseUtil.success(res, result.data, 'Filter options fetched successfully');
  } catch (error) {
    Logger.error('Error in getFilterOptions controller', error);
    next(error);
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  submitActualDispatch,
  revertActualDispatch,
  getFilterOptions
};
