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
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];

      const conditions = ["approval_status = 'approved'"];
      if (!all) conditions.push("status = 'Active'");
      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(salesman_name ILIKE $${values.length} OR broker_id ILIKE $${values.length} OR depot_name ILIKE $${values.length} OR email_id ILIKE $${values.length})`);
      }
      const whereClause = " WHERE " + conditions.join(" AND ");

      // Get count
      const countQuery = `SELECT COUNT(*) FROM broker_details ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      let query = `
        SELECT broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id
        FROM broker_details
        ${whereClause}
        ORDER BY salesman_name ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      
      values.push(limit, offset);
      const result = await pool.query(query, values);
      
      Logger.info(`Fetched ${result.rows.length} brokers (total: ${total}, search: "${search}")`);
      return {
        brokers: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
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
  async getPendingBrokers() {
    try {
      const result = await pool.query(`
        SELECT bd.broker_id, bd.salesman_name, bd.status, bd.email_id, bd.mobile_no,
               bd.depot_name, bd.rejection_reason, bd.created_at, l.username AS created_by_name
        FROM broker_details bd LEFT JOIN login l ON l.id = bd.created_by
        WHERE bd.approval_status = 'pending' ORDER BY bd.created_at ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending brokers:', error); throw error; }
  }

  async reviewBroker(id, action, reviewedBy, reason) {
    try {
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const result = await pool.query(
        `UPDATE broker_details SET approval_status=$1, reviewed_by=$2, rejection_reason=$3
         WHERE broker_id=$4 AND approval_status='pending' RETURNING *`,
        [approvalStatus, reviewedBy, reason || null, id]
      );
      if (!result.rows.length) throw new Error(`Pending broker ${id} not found`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing broker ${id}:`, error); throw error; }
  }

  async createBroker(data) {
    try {
      const {
        broker_id, salesman_name, status = 'Active', email_id, mobile_no, depot_name, depot_id,
        approval_status = 'approved', created_by = null
      } = data;

      const query = `
        INSERT INTO broker_details (broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `;

      const values = [broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by];

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
