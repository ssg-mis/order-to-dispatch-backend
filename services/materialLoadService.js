/**
 * Material Load Service
 * Business logic for material load management (Stage 7: Material Load)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
 * - History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class MaterialLoadService {
  /**
   * Get pending material load records
   * Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending material load records
   */
  async getPendingMaterialLoads(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
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
          planned_3, actual_3, 
          actual_qty, weightment_slip_copy, rst_no,
          gross_weight, tare_weight, net_weight,
          transporter_name, reason_of_difference_in_weight_if_any_speacefic,
          truck_no, vehicle_no_plate_image,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY timestamp DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending material loads`);
      
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
      Logger.error('Error fetching pending material loads', error);
      throw new Error('Failed to fetch pending material loads');
    }
  }

  /**
   * Get material load history
   * History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getMaterialLoadHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_3 IS NOT NULL', 'actual_3 IS NOT NULL'];
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
          planned_3, actual_3, time_delay_3,
          actual_qty, weightment_slip_copy, rst_no,
          gross_weight, tare_weight, net_weight,
          transporter_name, reason_of_difference_in_weight_if_any_speacefic,
          truck_no, vehicle_no_plate_image,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_3 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} material load history records`);
      
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
      Logger.error('Error fetching material load history', error);
      throw new Error('Failed to fetch material load history');
    }
  }

  /**
   * Submit material load (set actual_3 and update load details)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Material load data
   * @returns {Promise<Object>} Updated record
   */
  async submitMaterialLoad(id, data = {}) {
    try {
      Logger.info(`Submitting material load for ID: ${id}`, { data });
      
      // Calculate time delay if planned_3 exists
      let timeDelay = null;
      if (data.planned_3) {
        const planned = new Date(data.planned_3);
        const actual = new Date();
        const diffMs = actual - planned;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        timeDelay = `${diffHours} hours`;
      }
      
      const updateData = {
        actual_3: new Date().toISOString(),
        time_delay_3: timeDelay,
        actual_qty: data.actual_qty || null,
        weightment_slip_copy: data.weightment_slip_copy || null,
        rst_no: data.rst_no || null,
        gross_weight: data.gross_weight || null,
        tare_weight: data.tare_weight || null,
        net_weight: data.net_weight || null,
        transporter_name: data.transporter_name || null,
        reason_of_difference_in_weight_if_any_speacefic: data.reason_of_difference_in_weight_if_any_speacefic || null,
        truck_no: data.truck_no || null,
        vehicle_no_plate_image: data.vehicle_no_plate_image || null,
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
      
      Logger.info(`Material load submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Material load submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting material load', error);
      throw error;
    }
  }

  /**
   * Get material load by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object>} Record details
   */
  async getMaterialLoadById(id) {
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
      Logger.error('Error fetching material load by ID', error);
      throw error;
    }
  }
}

module.exports = new MaterialLoadService();
