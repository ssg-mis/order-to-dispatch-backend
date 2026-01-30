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
  async getAllBrokers(params = {}) {
    try {
      const { all } = params;
      let query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
      `;
      
      if (!all) {
        query += " WHERE status = 'Active'";
      }
      
      query += " ORDER BY salesman_name ASC";
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} brokers (all: ${!!all})`);
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

  /**
   * Create a new broker
   */
  async createBroker(data) {
    try {
      const {
        broker_id,
        salesman_name,
        status = 'Active',
        email_id,
        mobile_no,
        depot_name,
        depot_id
      } = data;

      const query = `
        INSERT INTO broker_details (
          broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id];

      const result = await pool.query(query, values);
      Logger.info(`Created new broker with ID: ${result.rows[0].broker_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating broker:', error);
      throw error;
    }
  }

  /**
   * Update an existing broker
   */
  async updateBroker(id, data) {
    try {
      const {
        salesman_name,
        status,
        email_id,
        mobile_no,
        depot_name,
        depot_id
      } = data;

      const query = `
        UPDATE broker_details
        SET 
          salesman_name = $1,
          status = $2,
          email_id = $3,
          mobile_no = $4,
          depot_name = $5,
          depot_id = $6
        WHERE broker_id = $7
        RETURNING *
      `;

      const values = [salesman_name, status, email_id, mobile_no, depot_name, depot_id, id];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Broker with ID ${id} not found`);
      }

      Logger.info(`Updated broker ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating broker ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a broker
   */
  async deleteBroker(id) {
    try {
      const query = `
        UPDATE broker_details
        SET status = 'Inactive'
        WHERE broker_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Broker with ID ${id} not found`);
      }

      Logger.info(`Soft deleted broker ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting broker ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new BrokerService();
