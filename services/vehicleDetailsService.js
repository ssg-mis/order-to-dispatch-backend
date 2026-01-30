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
      
      // Since consolidated, check Stage 5 status
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NULL'];
      // ... same filter logic as ActualDispatchService
      let queryParams = [];
      let paramIndex = 1;
      
      if (filters.d_sr_number) {
        whereConditions.push(`lrc.d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }
      
      if (filters.so_no) {
        whereConditions.push(`lrc.so_no = $${paramIndex}`);
        queryParams.push(filters.so_no);
        paramIndex++;
      }
      
      if (filters.party_name) {
        whereConditions.push(`lrc.party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
        paramIndex++;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      const dataQuery = `
        SELECT lrc.*, od.sku_name, od.approval_qty FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        ORDER BY lrc.timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('Error fetching pending vehicle details', error);
      throw new Error('Failed to fetch pending vehicle details');
    }
  }

  async getVehicleDetailsHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      if (filters.d_sr_number) {
        whereConditions.push(`lrc.d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      const dataQuery = `
        SELECT lrc.* FROM lift_receiving_confirmation lrc
        ${whereClause}
        ORDER BY lrc.actual_1 DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('Error fetching vehicle details history', error);
      throw new Error('Failed to fetch vehicle details history');
    }
  }

  async submitVehicleDetails(id, data = {}) {
    try {
      Logger.info(`Submitting vehicle details for ID: ${id}`, { data });
      
      const updateData = {
        vehicle_number: data.vehicle_number || null,
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
      if (result.rows.length === 0) throw new Error('Record not found');
      
      return { success: true, message: 'Vehicle details submitted successfully', data: result.rows[0] };
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
