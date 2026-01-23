/**
 * Customer Details Service
 * Handles operations for customer_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class CustomerService {
  /**
   * Get all active customers
   */
  async getAllCustomers() {
    try {
      const query = `
        SELECT 
          id,
          customer_id,
          customer_name,
          status,
          contact_person,
          contact,
          email,
          address_line_1,
          address_line_2,
          state,
          pincode,
          pan,
          gstin,
          gst_registered
        FROM customer_details
        WHERE status = 'Active'
        ORDER BY customer_name ASC
      `;
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} active customers`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching customers:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId) {
    try {
      const query = `
        SELECT 
          id,
          customer_id,
          customer_name,
          status,
          contact_person,
          contact,
          email,
          address_line_1,
          address_line_2,
          state,
          pincode,
          pan,
          gstin,
          gst_registered
        FROM customer_details
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [customerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched customer details for ID: ${customerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Get customer by name
   */
  async getCustomerByName(customerName) {
    try {
      const query = `
        SELECT 
          id,
          customer_id,
          customer_name,
          status,
          contact_person,
          contact,
          email,
          address_line_1,
          address_line_2,
          state,
          pincode,
          pan,
          gstin,
          gst_registered
        FROM customer_details
        WHERE customer_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [customerName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched customer details for: ${customerName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching customer by name ${customerName}:`, error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
