/**
 * Depot Controller
 * Handles HTTP requests for depot operations
 */

const depotService = require('../services/depotService');
const Logger = require('../utils/logger');

/**
 * Get all active depots
 */
async function getAllDepots(req, res) {
  try {
    const depots = await depotService.getAllDepots(req.query);
    
    res.status(200).json({
      success: true,
      data: depots,
      count: depots.length
    });
  } catch (error) {
    Logger.error('Error in getAllDepots controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depots',
      error: error.message
    });
  }
}

/**
 * Get depot by ID
 */
async function getDepotById(req, res) {
  try {
    const { id } = req.params;
    
    const depot = await depotService.getDepotById(id);
    
    if (!depot) {
      return res.status(404).json({
        success: false,
        message: `Depot with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: depot
    });
  } catch (error) {
    Logger.error('Error in getDepotById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depot',
      error: error.message
    });
  }
}

/**
 * Get depot by name
 */
async function getDepotByName(req, res) {
  try {
    const { name } = req.params;
    
    const depot = await depotService.getDepotByName(decodeURIComponent(name));
    
    if (!depot) {
      return res.status(404).json({
        success: false,
        message: `Depot '${name}' not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: depot
    });
  } catch (error) {
    Logger.error('Error in getDepotByName controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch depot',
      error: error.message
    });
  }
}

/**
 * Create a new depot
 */
async function createDepot(req, res) {
  try {
    const depot = await depotService.createDepot(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Depot created successfully',
      data: depot
    });
  } catch (error) {
    Logger.error('Error in createDepot controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create depot',
      error: error.message
    });
  }
}

/**
 * Update an existing depot
 */
async function updateDepot(req, res) {
  try {
    const { id } = req.params;
    const depot = await depotService.updateDepot(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Depot updated successfully',
      data: depot
    });
  } catch (error) {
    Logger.error('Error in updateDepot controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update depot',
      error: error.message
    });
  }
}

/**
 * Delete a depot
 */
async function deleteDepot(req, res) {
  try {
    const { id } = req.params;
    await depotService.deleteDepot(id);
    
    res.status(200).json({
      success: true,
      message: 'Depot deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteDepot controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete depot',
      error: error.message
    });
  }
}

module.exports = {
  getAllDepots,
  getDepotById,
  getDepotByName,
  createDepot,
  updateDepot,
  deleteDepot
};
