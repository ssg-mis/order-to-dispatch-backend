/**
 * Vehicle Details Service
 * Business logic for vehicle details management (Stage 6: Vehicle Details)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_2 IS NOT NULL AND actual_2 IS NULL
 * - History: planned_2 IS NOT NULL AND actual_2 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class VehicleDetailsService {
  /**
   * Get pending vehicle assignments
   * Pending: planned_2 IS NOT NULL AND actual_2 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending vehicle assignments
   */
  async getPendingVehicleDetails(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_2 IS NOT NULL', 'actual_2 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
      if (filters.d_sr_number) {
        whereConditions.push(`d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }
      
      if (filters.so_no) {
        whereConditions.push(`so_no = $${paramIndex}`);
        queryParams.push(filters.so_no);
        paramIndex++;
      }
      
      if (filters.party_name) {
        whereConditions.push(`party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
        paramIndex++;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data
      const dataQuery = `
        SELECT 
          id, d_sr_number, so_no, party_name, product_name,
          qty_to_be_dispatched, type_of_transporting, dispatch_from,
          planned_2, actual_2, check_status, remarks,
          fitness, insurance, tax_copy, polution, permit1, permit2_out_state,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY timestamp DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending vehicle details`);
      
      return {
        success: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching pending vehicle details', error);
      throw new Error('Failed to fetch pending vehicle details');
    }
  }

  /**
   * Get vehicle details history
   * History: planned_2 IS NOT NULL AND actual_2 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getVehicleDetailsHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_2 IS NOT NULL', 'actual_2 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
      if (filters.d_sr_number) {
        whereConditions.push(`d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }
      
      if (filters.so_no) {
        whereConditions.push(`so_no = $${paramIndex}`);
        queryParams.push(filters.so_no);
        paramIndex++;
      }
      
      if (filters.party_name) {
        whereConditions.push(`party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
        paramIndex++;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data
      const dataQuery = `
        SELECT 
          id, d_sr_number, so_no, party_name, product_name,
          qty_to_be_dispatched, type_of_transporting, dispatch_from,
          planned_2, actual_2, time_delay_2, check_status, remarks,
          fitness, insurance, tax_copy, polution, permit1, permit2_out_state,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_2 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} vehicle details history records`);
      
      return {
        success: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching vehicle details history', error);
      throw new Error('Failed to fetch vehicle details history');
    }
  }

  /**
   * Submit vehicle details (set actual_2 and update vehicle info)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Vehicle details data
   * @returns {Promise<Object>} Updated record
   */
  async submitVehicleDetails(id, data = {}) {
    try {
      Logger.info(`Submitting vehicle details for ID: ${id}`, { data });
      
      // Calculate time delay if planned_2 exists
      let timeDelay = null;
      if (data.planned_2) {
        const planned = new Date(data.planned_2);
        const actual = new Date();
        const diffMs = actual - planned;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        timeDelay = `${diffHours} hours`;
      }
      
      const updateData = {
        actual_2: new Date().toISOString(),
        time_delay_2: timeDelay,
        check_status: data.check_status || null,
        remarks: data.remarks || null,
        fitness: data.fitness || null,
        insurance: data.insurance || null,
        tax_copy: data.tax_copy || null,
        polution: data.polution || null,
        permit1: data.permit1 || null,
        permit2_out_state: data.permit2_out_state || null,
      };
      
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      
      const query = `
        UPDATE lift_receiving_confirmation 
        SET ${setClause}
        WHERE id = $${fields.length + 1}
        RETURNING *
      `;
      
      const result = await db.query(query, [...values, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }
      
      Logger.info(`Vehicle details submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Vehicle details submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting vehicle details', error);
      throw error;
    }
  }

  /**
   * Get vehicle details by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object>} Record details
   */
  async getVehicleDetailsById(id) {
    try {
      const query = `
        SELECT * FROM lift_receiving_confirmation 
        WHERE id = $1
      `;
      
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }
      
      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error fetching vehicle details by ID', error);
      throw error;
    }
  }
}

module.exports = new VehicleDetailsService();
