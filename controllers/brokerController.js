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
    const brokers = await brokerService.getAllBrokers();
    
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

module.exports = {
  getAllBrokers,
  getBrokerById,
  getBrokerByName
};
