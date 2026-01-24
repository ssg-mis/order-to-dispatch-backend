/**
 * Broker Details Service
 * Handles operations for broker_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class BrokerService {
  /**
   * Get all active brokers
   */
  async getAllBrokers() {
    try {
      const query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
        WHERE status = 'Active'
        ORDER BY salesman_name ASC
      `;
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} active brokers`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching brokers:', error);
      throw error;
    }
  }

  /**
   * Get broker by ID
   */
  async getBrokerById(brokerId) {
    try {
      const query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
        WHERE broker_id = $1
      `;
      
      const result = await pool.query(query, [brokerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched broker details for ID: ${brokerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching broker ${brokerId}:`, error);
      throw error;
    }
  }

  /**
   * Get broker by salesman name
   */
  async getBrokerByName(salesmanName) {
    try {
      const query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
        WHERE salesman_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [salesmanName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched broker details for: ${salesmanName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching broker by name ${salesmanName}:`, error);
      throw error;
    }
  }
}

module.exports = new BrokerService();
