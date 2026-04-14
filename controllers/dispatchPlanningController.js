/**
 * Dispatch Planning Controller
 * Handles HTTP requests for dispatch planning (Stage 4: Dispatch Planning)
 */

const dispatchPlanningService = require('../services/dispatchPlanningService');
const { ResponseUtil, Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

/**
 * Get pending dispatch planning orders
 * @route GET /api/v1/dispatch-planning/pending
 */
const getPendingDispatches = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, start_date, end_date, depo_names, ...otherFilters } = req.query;
    
    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined') 
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === "" ? [] : depo_names.split(','))) 
        : undefined,
      ...otherFilters
    };
    
    // Remove only undefined/null filters (keep empty arrays for strict access)
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
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
    const { page, limit, order_no, customer_name, start_date, end_date, depo_names, ...otherFilters } = req.query;
    
    const filters = {
      order_no,
      customer_name,
      start_date,
      end_date,
      depo_names: (depo_names !== undefined && depo_names !== 'undefined') 
        ? (Array.isArray(depo_names) ? depo_names : (depo_names === "" ? [] : depo_names.split(','))) 
        : undefined,
      ...otherFilters
    };
    
    // Remove only undefined/null filters (keep empty arrays for strict access)
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null) delete filters[key];
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
    
    // Trigger WhatsApp notification for the next stage
    try {
      if (result.success && result.data && result.data.so_no) {
        const docDetails = {
          stage: `📦 *Dispatch Planned*\n📍 *Pending in Actual Dispatch*`,
          do_number: result.data.so_no
        };
        if (req.pageAccessDetails) {
          await whatsappShareService(docDetails, req.pageAccessDetails, 'Actual Dispatch');
        }
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for Dispatch Planning', notifyError);
    }
    
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

/**
 * Revert dispatch planning back to pre-approval
 * @route POST /api/v1/dispatch-planning/revert/:id
 */
const revertDispatchPlanning = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, remarks } = req.body;

    Logger.info(`[DISPATCH PLANNING] Reverting order ID: ${id}`, { username, remarks });

    const result = await dispatchPlanningService.revertDispatchPlanning(id, username, remarks);

    return ResponseUtil.success(res, result, result.message);
  } catch (error) {
    Logger.error('[DISPATCH PLANNING] Error in revertDispatchPlanning controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Update transfer details for an order
 * @route POST /api/v1/dispatch-planning/update-transfer/:id
 */
const updateTransferDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transferData = req.body;
    
    Logger.info(`[DISPATCH PLANNING] Updating transfer details for order ID: ${id}`, { transferData });
    
    const result = await dispatchPlanningService.updateTransferDetails(id, transferData);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('[DISPATCH PLANNING] Error in updateTransferDetails controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  getPendingDispatches,
  getDispatchHistory,
  submitDispatchPlanning,
  revertDispatchPlanning,
  updateTransferDetails
};
