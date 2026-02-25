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
      
      // Since consolidated, check Stage 5 status
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NULL'];
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
      Logger.error('Error fetching pending material loads', error);
      throw new Error('Failed to fetch pending material loads');
    }
  }

  async getMaterialLoadHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
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
      Logger.error('Error fetching material load history', error);
      throw new Error('Failed to fetch material load history');
    }
  }

  async submitMaterialLoad(id, data = {}) {
    try {
      Logger.info(`Submitting material load for ID: ${id}`, { data });
      
      const updateData = {
        actual_qty: data.actual_qty || null,
        material_load_user: data.username || null,
        weightment_slip_copy: data.weightment_slip_copy || null,
        rst_no: data.rst_no || null,
        gross_weight: data.gross_weight || null,
        tare_weight: data.tare_weight || null,
        net_weight: data.net_weight || null,
        transporter_name: data.transporter_name || null,
        reason_of_difference_in_weight_if_any_speacefic: data.reason_of_difference_in_weight_if_any_speacefic || null,
        truck_no: data.truck_no || null,
        vehicle_no_plate_image: data.vehicle_no_plate_image || null,
        check_status: data.check_status || null,
        remarks: data.remarks || null,
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
      
      return { success: true, message: 'Material load submitted successfully', data: result.rows[0] };
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
