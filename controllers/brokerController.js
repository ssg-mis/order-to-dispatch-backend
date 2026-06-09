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
    const result = await brokerService.getAllBrokers(req.query);
    
    res.status(200).json({
      success: true,
      data: result
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
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const broker = await brokerService.createBroker({ ...req.body, approval_status: isAdmin ? 'approved' : 'pending', created_by: req.user?.id || null });
    res.status(201).json({ success: true, message: isAdmin ? 'Broker created successfully' : 'Broker submitted for approval', data: broker });
  } catch (error) {
    Logger.error('Error in createBroker controller:', error);
    res.status(500).json({ success: false, message: 'Failed to create broker', error: error.message });
  }
}

async function getPendingBrokers(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    res.status(200).json({ success: true, data: await brokerService.getPendingBrokers() });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch pending brokers', error: error.message }); }
}

async function reviewBroker(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    const broker = await brokerService.reviewBroker(req.params.id, action, req.user.id, reason);
    res.status(200).json({ success: true, message: `Broker ${action === 'approve' ? 'approved' : 'rejected'} successfully`, data: broker });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to review broker', error: error.message }); }
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
  deleteBroker: deleteCustomer,
  getPendingBrokers,
  reviewBroker
};
