/**
 * Gate In Controller
 * Handles HTTP requests for Gate In workflow stage
 */

const gateInService = require('../services/gateInService');
const { ResponseUtil, Logger } = require('../utils');

const getPending = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    Logger.info('[GATE IN] Fetching pending');
    const result = await gateInService.getPending({ page, limit });
    return ResponseUtil.success(res, { records: result.data, pagination: result.pagination }, 'Pending gate-ins fetched successfully');
  } catch (error) {
    Logger.error('[GATE IN] Error in getPending controller', error);
    next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    Logger.info('[GATE IN] Fetching history');
    const result = await gateInService.getHistory({ page, limit });
    return ResponseUtil.success(res, { records: result.data, pagination: result.pagination }, 'Gate-in history fetched successfully');
  } catch (error) {
    Logger.error('[GATE IN] Error in getHistory controller', error);
    next(error);
  }
};

const submitGateIn = async (req, res, next) => {
  try {
    const { orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto } = req.body;

    if (!orderKey || !username) {
      return ResponseUtil.validationError(res, [
        !orderKey  && { field: 'orderKey',  message: 'orderKey is required' },
        !username  && { field: 'username',  message: 'username is required' },
      ].filter(Boolean));
    }

    Logger.info(`[GATE IN] Submitting for order_key=${orderKey}`);
    const result = await gateInService.submitGateIn(orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto);
    return ResponseUtil.success(res, result.data, 'Gate-in submitted successfully');
  } catch (error) {
    Logger.error('[GATE IN] Error in submitGateIn controller', error);
    next(error);
  }
};

const getByOrderKey = async (req, res, next) => {
  try {
    const { order_key } = req.query;
    if (!order_key) {
      return ResponseUtil.validationError(res, [{ field: 'order_key', message: 'order_key is required' }]);
    }
    const result = await gateInService.getByOrderKey(order_key);
    return ResponseUtil.success(res, result.data, result.data ? 'Gate-in record found' : 'No gate-in record found');
  } catch (error) {
    Logger.error('[GATE IN] Error in getByOrderKey controller', error);
    next(error);
  }
};

module.exports = { getPending, getHistory, submitGateIn, getByOrderKey };
