/**
 * Vehicle Details Controller
 * API endpoints for vehicle details management (Stage 6)
 */

const vehicleDetailsService = require('../services/vehicleDetailsService');
const { Logger } = require('../utils');

/**
 * Get pending vehicle assignments
 * GET /api/v1/vehicle-details/pending
 */
const getPendingVehicleDetails = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await vehicleDetailsService.getPendingVehicleDetails(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Pending vehicle details fetched successfully',
      data: {
        vehicleDetails: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getPendingVehicleDetails controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pending vehicle details'
    });
  }
};

/**
 * Get vehicle details history
 * GET /api/v1/vehicle-details/history
 */
const getVehicleDetailsHistory = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await vehicleDetailsService.getVehicleDetailsHistory(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Vehicle details history fetched successfully',
      data: {
        vehicleDetails: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getVehicleDetailsHistory controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vehicle details history'
    });
  }
};

/**
 * Submit vehicle details
 * POST /api/v1/vehicle-details/submit/:id
 */
const submitVehicleDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehicleData = req.body;
    
    Logger.info(`Submit vehicle details request for ID: ${id}`, { vehicleData });
    
    const result = await vehicleDetailsService.submitVehicleDetails(id, vehicleData);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in submitVehicleDetails controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit vehicle details'
    });
  }
};

/**
 * Get vehicle details by ID
 * GET /api/v1/vehicle-details/:id
 */
const getVehicleDetailsById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await vehicleDetailsService.getVehicleDetailsById(id);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in getVehicleDetailsById controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch vehicle details'
    });
  }
};

module.exports = {
  getPendingVehicleDetails,
  getVehicleDetailsHistory,
  submitVehicleDetails,
  getVehicleDetailsById,
};
