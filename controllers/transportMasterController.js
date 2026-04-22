const transportMasterService = require('../services/transportMasterService');
const Logger = require('../utils/logger');

/**
 * Get all transporters with pagination and search
 */
const getAllTransporters = async (req, res, next) => {
  try {
    const { all, page, limit, search } = req.query;
    const result = await transportMasterService.getAllTransporters({ all, page, limit, search });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Controller Error - getAllTransporters:', error);
    next(error);
  }
};

/**
 * Get transporter by ID
 */
const getTransporterById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.getTransporterById(id);
    
    if (!transporter) {
      return res.status(404).json({
        success: false,
        message: 'Transporter not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - getTransporterById:', error);
    next(error);
  }
};

/**
 * Create new transporter
 */
const createTransporter = async (req, res, next) => {
  try {
    const transporter = await transportMasterService.createTransporter(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Transporter created successfully',
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - createTransporter:', error);
    next(error);
  }
};

/**
 * Update transporter
 */
const updateTransporter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.updateTransporter(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Transporter updated successfully',
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - updateTransporter:', error);
    next(error);
  }
};

/**
 * Delete transporter (soft delete)
 */
const deleteTransporter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.deleteTransporter(id);
    
    res.status(200).json({
      success: true,
      message: 'Transporter deleted successfully',
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - deleteTransporter:', error);
    next(error);
  }
};

module.exports = {
  getAllTransporters,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter
};
