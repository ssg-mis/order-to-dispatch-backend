/**
 * Customer Controller
 * Handles HTTP requests for customer operations
 */

const customerService = require('../services/customerService');
const Logger = require('../utils/logger');

/**
 * Get all active customers
 */
async function getAllCustomers(req, res) {
  try {
    const result = await customerService.getAllCustomers(req.query);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Error in getAllCustomers controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
}

/**
 * Get customer by ID
 */
async function getCustomerById(req, res) {
  try {
    const { id } = req.params;
    
    const customer = await customerService.getCustomerById(id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    Logger.error('Error in getCustomerById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
      error: error.message
    });
  }
}

/**
 * Get customer by name
 */
async function getCustomerByName(req, res) {
  try {
    const { name } = req.params;
    
    const customer = await customerService.getCustomerByName(decodeURIComponent(name));
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer '${name}' not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    Logger.error('Error in getCustomerByName controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
      error: error.message
    });
  }
}

/**
 * Create a new customer
 */
async function createCustomer(req, res) {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const data = {
      ...req.body,
      approval_status: isAdmin ? 'approved' : 'pending',
      created_by: req.user?.id || null
    };
    const customer = await customerService.createCustomer(data);

    res.status(201).json({
      success: true,
      message: isAdmin ? 'Customer created successfully' : 'Customer submitted for approval',
      data: customer
    });
  } catch (error) {
    Logger.error('Error in createCustomer controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message
    });
  }
}

/**
 * Get pending customers (admin only)
 */
async function getPendingCustomers(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const customers = await customerService.getPendingCustomers();
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    Logger.error('Error in getPendingCustomers controller:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending customers', error: error.message });
  }
}

/**
 * Approve or reject a pending customer (admin only)
 */
async function reviewCustomer(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    const { action, reason, ...overrides } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const customer = await customerService.reviewCustomer(id, action, req.user.id, reason, overrides);
    res.status(200).json({
      success: true,
      message: `Customer ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: customer
    });
  } catch (error) {
    Logger.error('Error in reviewCustomer controller:', error);
    res.status(500).json({ success: false, message: 'Failed to review customer', error: error.message });
  }
}

/**
 * Update an existing customer
 */
async function updateCustomer(req, res) {
  try {
    const { id } = req.params;
    const customer = await customerService.updateCustomer(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    Logger.error('Error in updateCustomer controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
}

/**
 * Delete a customer
 */
async function deleteCustomer(req, res) {
  try {
    const { id } = req.params;
    await customerService.deleteCustomer(id);
    
    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteCustomer controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: error.message
    });
  }
}

module.exports = {
  getAllCustomers,
  getCustomerById,
  getCustomerByName,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getPendingCustomers,
  reviewCustomer
};
