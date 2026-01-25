/**
 * Gate Out Service
 * Business logic for gate out management (Stage 11: Gate Out)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_7 IS NOT NULL AND actual_7 IS NULL
 * - History: planned_7 IS NOT NULL AND actual_7 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class GateOutService {
  /**
   * Get pending gate out records
   * Pending: planned_7 IS NOT NULL AND actual_7 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending records
   */
  async getPendingGateOut(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_7 IS NOT NULL', 'actual_7 IS NULL'];
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
          product_name_1, actual_qty_dispatch,
          check_status, remarks,
          fitness, insurance, tax_copy, polution, permit1, permit2_out_state,
          actual_qty, weightment_slip_copy, rst_no,
          transporter_name, reason_of_difference_in_weight_if_any_speacefic,
          truck_no, vehicle_no_plate_image,
          bilty_no,
          planned_7, actual_7,
          gross_weight, tare_weight, net_weight,
          timestamp,
          invoice_no, invoice_date, bill_amount
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY planned_7 ASC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending gate out records`);
      
      return {
        success: true,
        data: {
          orders: dataResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      Logger.error('Error fetching pending gate out records', error);
      throw new Error('Failed to fetch pending gate out records');
    }
  }

  /**
   * Get gate out history
   * History: planned_7 IS NOT NULL AND actual_7 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getGateOutHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_7 IS NOT NULL', 'actual_7 IS NOT NULL'];
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
          planned_7, actual_7,
          truck_no,
          gate_pass_copy, vehicle_loaded_image,
          timestamp,
          invoice_no
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_7 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} gate out history records`);
      
      return {
        success: true,
        data: {
          orders: dataResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      Logger.error('Error fetching gate out history', error);
      throw new Error('Failed to fetch gate out history');
    }
  }

  /**
   * Submit gate out (set actual_7)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Gate out data
   * @returns {Promise<Object>} Updated record
   */
  async submitGateOut(id, data = {}) {
    try {
      Logger.info(`Submitting gate out for ID: ${id}`, { data });
      
      const updateData = {
        actual_7: new Date().toISOString(), // Gate Out Timestamp
        gate_pass_copy: data.gate_pass || null, // Renamed column
        vehicle_loaded_image: data.vehicle_image || null // Renamed column
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
      
      Logger.info(`Gate out submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Gate out submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting gate out', error);
      throw error;
    }
  }
}

module.exports = new GateOutService();
