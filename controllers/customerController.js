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
    const customers = await customerService.getAllCustomers();
    
    res.status(200).json({
      success: true,
      data: customers,
      count: customers.length
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

module.exports = {
  getAllCustomers,
  getCustomerById,
  getCustomerByName
};
