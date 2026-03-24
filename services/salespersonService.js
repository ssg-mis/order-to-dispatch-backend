/**
 * Salesperson Details Service
 * Handles operations for salesperson_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class SalespersonService {
  /**
   * Get all active salespersons
   */
  async getAllSalespersons(params = {}) {
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
        FROM salesperson_details
      `;
      
      if (!all || all === 'false') {
        query += " WHERE status = 'Active'";
      }
      
      query += " ORDER BY salesman_name ASC";
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} salespersons (all: ${!!all})`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching salespersons:', error);
      throw error;
    }
  }

  /**
   * Get salesperson by ID
   */
  async getSalespersonById(brokerId) {
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
        FROM salesperson_details
        WHERE broker_id = $1
      `;
      
      const result = await pool.query(query, [brokerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched salesperson details for ID: ${brokerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching salesperson ${brokerId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new salesperson
   */
  async createSalesperson(data) {
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
        INSERT INTO salesperson_details (
          broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id];

      const result = await pool.query(query, values);
      Logger.info(`Created new salesperson with ID: ${result.rows[0].broker_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating salesperson:', error);
      throw error;
    }
  }

  /**
   * Update an existing salesperson
   */
  async updateSalesperson(id, data) {
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
        UPDATE salesperson_details
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
        throw new Error(`Salesperson with ID ${id} not found`);
      }

      Logger.info(`Updated salesperson ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating salesperson ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a salesperson
   */
  async deleteSalesperson(id) {
    try {
      const query = `
        UPDATE salesperson_details
        SET status = 'Inactive'
        WHERE broker_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Salesperson with ID ${id} not found`);
      }

      Logger.info(`Soft deleted salesperson ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting salesperson ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new SalespersonService();
