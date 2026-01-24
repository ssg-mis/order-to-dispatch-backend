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
  async getAllDepots() {
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
        WHERE status = 'Active'
        ORDER BY depot_name ASC
      `;
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} active depots`);
      return result.rows;
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
}

module.exports = new DepotService();
