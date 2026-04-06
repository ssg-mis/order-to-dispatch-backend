/**
 * Depot Details Service
 * Handles operations for depot_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class DepotService {
  /**
   * Get all active depots
   */
  async getAllDepots(params = {}) {
    try {
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];
      let whereClause = "";
      
      if (all !== 'true') {
        whereClause = " WHERE status = 'Active'";
      }
      
      if (search) {
        const searchPattern = `%${search}%`;
        const searchIndex = values.length + 1;
        values.push(searchPattern);
        whereClause += whereClause ? " AND " : " WHERE ";
        whereClause += `(depot_name ILIKE $${searchIndex} OR depot_id ILIKE $${searchIndex} OR salesman_broker_name ILIKE $${searchIndex} OR depot_address ILIKE $${searchIndex})`;
      }

      // Get count
      const countQuery = `SELECT COUNT(*) FROM depot_details ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      let query = `
        SELECT depot_id, depot_name, status, depot_address, state, salesman_broker_name
        FROM depot_details
        ${whereClause}
        ORDER BY depot_name ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      
      values.push(limit, offset);
      const result = await pool.query(query, values);
      
      Logger.info(`Fetched ${result.rows.length} depots (total: ${total}, search: "${search}")`);
      return {
        depots: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching depots:', error);
      throw error;
    }
  }

  /**
   * Get depot by ID
   */
  async getDepotById(depotId) {
    try {
      const query = `
        SELECT 
          depot_id,
          depot_name,
          status,
          depot_address,
          state,
          salesman_broker_name
        FROM depot_details
        WHERE depot_id = $1
      `;
      
      const result = await pool.query(query, [depotId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched depot details for ID: ${depotId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching depot ${depotId}:`, error);
      throw error;
    }
  }

  /**
   * Get depot by name
   */
  async getDepotByName(depotName) {
    try {
      const query = `
        SELECT 
          depot_id,
          depot_name,
          status,
          depot_address,
          state,
          salesman_broker_name
        FROM depot_details
        WHERE depot_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [depotName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched depot details for: ${depotName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching depot by name ${depotName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new depot
   */
  async createDepot(data) {
    try {
      const {
        depot_id,
        depot_name,
        status = 'Active',
        depot_address,
        state,
        salesman_broker_name
      } = data;

      const query = `
        INSERT INTO depot_details (
          depot_id, depot_name, status, depot_address, state, salesman_broker_name
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [depot_id, depot_name, status, depot_address, state, salesman_broker_name];

      const result = await pool.query(query, values);
      Logger.info(`Created new depot with ID: ${result.rows[0].depot_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating depot:', error);
      throw error;
    }
  }

  /**
   * Update an existing depot
   */
  async updateDepot(id, data) {
    try {
      const {
        depot_name,
        status,
        depot_address,
        state,
        salesman_broker_name
      } = data;

      const query = `
        UPDATE depot_details
        SET 
          depot_name = $1,
          status = $2,
          depot_address = $3,
          state = $4,
          salesman_broker_name = $5
        WHERE depot_id = $6
        RETURNING *
      `;

      const values = [depot_name, status, depot_address, state, salesman_broker_name, id];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Depot with ID ${id} not found`);
      }

      Logger.info(`Updated depot ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating depot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a depot
   */
  async deleteDepot(id) {
    try {
      const query = `
        UPDATE depot_details
        SET status = 'Inactive'
        WHERE depot_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Depot with ID ${id} not found`);
      }

      Logger.info(`Soft deleted depot ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting depot ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DepotService();
