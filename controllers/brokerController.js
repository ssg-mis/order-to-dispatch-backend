/**
 * Broker Controller
 * Handles HTTP requests for broker operations
 */

const brokerService = require('../services/brokerService');
const Logger = require('../utils/logger');

/**
 * Get all active brokers
 */
async function getAllBrokers(req, res) {
  try {
    const brokers = await brokerService.getAllBrokers(req.query);
    
    res.status(200).json({
      success: true,
      data: brokers,
      count: brokers.length
    });
  } catch (error) {
    Logger.error('Error in getAllBrokers controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brokers',
      error: error.message
    });
  }
}

/**
 * Get broker by ID
 */
async function getBrokerById(req, res) {
  try {
    const { id } = req.params;
    
    const broker = await brokerService.getBrokerById(id);
    
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: broker
    });
  } catch (error) {
    Logger.error('Error in getBrokerById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch broker',
      error: error.message
    });
  }
}

/**
 * Get broker by name
 */
async function getBrokerByName(req, res) {
  try {
    const { name } = req.params;
    
    const broker = await brokerService.getBrokerByName(decodeURIComponent(name));
    
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: `Broker '${name}' not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: broker
    });
  } catch (error) {
    Logger.error('Error in getBrokerByName controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch broker',
      error: error.message
    });
  }
}

/**
 * Create a new broker
 */
async function createBroker(req, res) {
  try {
    const broker = await brokerService.createBroker(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Broker created successfully',
      data: broker
    });
  } catch (error) {
    Logger.error('Error in createBroker controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create broker',
      error: error.message
    });
  }
}

/**
 * Update an existing broker
 */
async function updateBroker(req, res) {
  try {
    const { id } = req.params;
    const broker = await brokerService.updateBroker(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Broker updated successfully',
      data: broker
    });
  } catch (error) {
    Logger.error('Error in updateBroker controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update broker',
      error: error.message
    });
  }
}

/**
 * Delete a broker
 */
async function deleteCustomer(req, res) {
  try {
    const { id } = req.params;
    await brokerService.deleteBroker(id);
    
    res.status(200).json({
      success: true,
      message: 'Broker deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteBroker controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete broker',
      error: error.message
    });
  }
}

module.exports = {
  getAllBrokers,
  getBrokerById,
  getBrokerByName,
  createBroker,
  updateBroker,
  deleteBroker: deleteCustomer
};
