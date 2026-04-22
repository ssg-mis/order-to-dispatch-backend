/**
 * Vehicle Master Controller
 */

const vehicleMasterService = require('../services/vehicleMasterService');
const Logger = require('../utils/logger');

/**
 * Get all vehicles
 */
async function getAllVehicles(req, res) {
  try {
    const result = await vehicleMasterService.getAllVehicles(req.query);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Error in getAllVehicles controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles',
      error: error.message
    });
  }
}

/**
 * Get vehicle by ID
 */
async function getVehicleById(req, res) {
  try {
    const { id } = req.params;
    const vehicle = await vehicleMasterService.getVehicleById(id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    Logger.error('Error in getVehicleById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle',
      error: error.message
    });
  }
}

/**
 * Create a new vehicle
 */
async function createVehicle(req, res) {
  try {
    const vehicle = await vehicleMasterService.createVehicle(req.body);
    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle
    });
  } catch (error) {
    Logger.error('Error in createVehicle controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vehicle',
      error: error.message
    });
  }
}

/**
 * Update an existing vehicle
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;
    const vehicle = await vehicleMasterService.updateVehicle(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle
    });
  } catch (error) {
    Logger.error('Error in updateVehicle controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vehicle',
      error: error.message
    });
  }
}

/**
 * Delete a vehicle
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;
    await vehicleMasterService.deleteVehicle(id);
    res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteVehicle controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vehicle',
      error: error.message
    });
  }
}

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
};
