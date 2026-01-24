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
    const depots = await depotService.getAllDepots();
    
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

module.exports = {
  getAllDepots,
  getDepotById,
  getDepotByName
};
