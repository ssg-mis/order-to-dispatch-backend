/**
 * Check Invoice Service
 * Business logic for invoice checking (Stage 10: Check Invoice)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_6 IS NOT NULL AND actual_6 IS NULL
 * - History: planned_6 IS NOT NULL AND actual_6 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class CheckInvoiceService {
  /**
   * Get pending check invoice records
   * Pending: planned_6 IS NOT NULL AND actual_6 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending records
   */
  async getPendingInvoices(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_6 IS NOT NULL', 'actual_6 IS NULL'];
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
          planned_6, actual_6,
          bill_type, invoice_date, invoice_no, invoice_copy, qty, bill_amount,
          timestamp,
          invoice_no, invoice_date, bill_amount
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY timestamp DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending check invoices`);
      
      return {
        success: true,
        data: {
          invoices: dataResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      Logger.error('Error fetching pending check invoices', error);
      throw new Error('Failed to fetch pending check invoices');
    }
  }

  /**
   * Get check invoice history
   * History: planned_6 IS NOT NULL AND actual_6 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getCheckHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_6 IS NOT NULL', 'actual_6 IS NOT NULL'];
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
          planned_6, actual_6,
          status_1, remarks_2,
          bill_type, invoice_date, invoice_no, invoice_copy, qty, bill_amount,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_6 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} check invoice history records`);
      
      return {
        success: true,
        data: {
          invoices: dataResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      Logger.error('Error fetching check invoice history', error);
      throw new Error('Failed to fetch check invoice history');
    }
  }

  /**
   * Submit check invoice (set actual_6 and update status/remarks)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Check data
   * @returns {Promise<Object>} Updated record
   */
  async submitCheck(id, data = {}) {
    try {
      Logger.info(`Submitting check invoice for ID: ${id}`, { data });
      
      const updateData = {
        actual_6: new Date().toISOString(),
        status_1: data.status_1 || null,
        remarks_2: data.remarks_2 || null
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
      
      Logger.info(`Check invoice submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Check invoice submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting check invoice', error);
      throw error;
    }
  }
}

module.exports = new CheckInvoiceService();
