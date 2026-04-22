const driverMasterService = require('../services/driverMasterService');
const Logger = require('../utils/logger');

/**
 * Get all drivers with pagination and search
 */
const getAllDrivers = async (req, res, next) => {
  try {
    const { all, page, limit, search } = req.query;
    const result = await driverMasterService.getAllDrivers({ all, page, limit, search });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Controller Error - getAllDrivers:', error);
    next(error);
  }
};

/**
 * Get driver by ID
 */
const getDriverById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const driver = await driverMasterService.getDriverById(id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: driver
    });
  } catch (error) {
    Logger.error('Controller Error - getDriverById:', error);
    next(error);
  }
};

/**
 * Create new driver
 */
const createDriver = async (req, res, next) => {
  try {
    const driver = await driverMasterService.createDriver(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: driver
    });
  } catch (error) {
    Logger.error('Controller Error - createDriver:', error);
    next(error);
  }
};

/**
 * Update driver
 */
const updateDriver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const driver = await driverMasterService.updateDriver(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Driver updated successfully',
      data: driver
    });
  } catch (error) {
    Logger.error('Controller Error - updateDriver:', error);
    next(error);
  }
};

/**
 * Delete driver (soft delete)
 */
const deleteDriver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const driver = await driverMasterService.deleteDriver(id);
    
    res.status(200).json({
      success: true,
      message: 'Driver deleted successfully',
      data: driver
    });
  } catch (error) {
    Logger.error('Controller Error - deleteDriver:', error);
    next(error);
  }
};

module.exports = {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver
};
