/**
 * Salesperson Controller
 * Handles HTTP requests for salesperson operations
 */

const salespersonService = require('../services/salespersonService');
const Logger = require('../utils/logger');

/**
 * Get all active salespersons
 */
async function getAllSalespersons(req, res) {
  try {
    const result = await salespersonService.getAllSalespersons(req.query);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Error in getAllSalespersons controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salespersons',
      error: error.message
    });
  }
}

/**
 * Get salesperson by ID
 */
async function getSalespersonById(req, res) {
  try {
    const { id } = req.params;
    
    const salesperson = await salespersonService.getSalespersonById(id);
    
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: `Salesperson with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: salesperson
    });
  } catch (error) {
    Logger.error('Error in getSalespersonById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salesperson',
      error: error.message
    });
  }
}

/**
 * Create a new salesperson
 */
async function createSalesperson(req, res) {
  try {
    const salesperson = await salespersonService.createSalesperson(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Salesperson created successfully',
      data: salesperson
    });
  } catch (error) {
    Logger.error('Error in createSalesperson controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create salesperson',
      error: error.message
    });
  }
}

/**
 * Update an existing salesperson
 */
async function updateSalesperson(req, res) {
  try {
    const { id } = req.params;
    const salesperson = await salespersonService.updateSalesperson(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Salesperson updated successfully',
      data: salesperson
    });
  } catch (error) {
    Logger.error('Error in updateSalesperson controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update salesperson',
      error: error.message
    });
  }
}

/**
 * Delete a salesperson
 */
async function deleteSalesperson(req, res) {
  try {
    const { id } = req.params;
    await salespersonService.deleteSalesperson(id);
    
    res.status(200).json({
      success: true,
      message: 'Salesperson deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteSalesperson controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete salesperson',
      error: error.message
    });
  }
}

module.exports = {
  getAllSalespersons,
  getSalespersonById,
  createSalesperson,
  updateSalesperson,
  deleteSalesperson
};
