/**
 * Security Guard Approval Service
 * Business logic for security guard approval management (Stage 8: Security Guard Approval)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_4 IS NOT NULL AND actual_4 IS NULL
 * - History: planned_4 IS NOT NULL AND actual_4 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class SecurityGuardApprovalService {
  /**
   * Get pending security guard approvals
   * Pending: planned_4 IS NOT NULL AND actual_4 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending security guard approvals
   */
  async getPendingApprovals(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_4 IS NOT NULL', 'actual_4 IS NULL'];
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
          planned_4, actual_4, 
          bilty_no, bilty_image, vehicle_image_attachemrnt,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY timestamp DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending security guard approvals`);
      
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
      Logger.error('Error fetching pending security guard approvals', error);
      throw new Error('Failed to fetch pending security guard approvals');
    }
  }

  /**
   * Get security guard approval history
   * History: planned_4 IS NOT NULL AND actual_4 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getApprovalHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_4 IS NOT NULL', 'actual_4 IS NOT NULL'];
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
          planned_4, actual_4, 
          bilty_no, bilty_image, vehicle_image_attachemrnt,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_4 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} security guard approval history records`);
      
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
      Logger.error('Error fetching security guard approval history', error);
      throw new Error('Failed to fetch security guard approval history');
    }
  }

  /**
   * Submit security guard approval (set actual_4 and update approval details)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Security guard approval data
   * @returns {Promise<Object>} Updated record
   */
  async submitApproval(id, data = {}) {
    try {
      Logger.info(`Submitting security guard approval for ID: ${id}`, { data });
      
      // Calculate time delay if planned_4 exists
      let timeDelay = null;
      if (data.planned_4) {
        const planned = new Date(data.planned_4);
        const actual = new Date();
        const diffMs = actual - planned;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        timeDelay = `${diffHours} hours`;
      }
      
      const updateData = {
        actual_4: new Date().toISOString(),
        bilty_no: data.bilty_no || null,
        bilty_image: data.bilty_image || null,
        vehicle_image_attachemrnt: data.vehicle_image_attachemrnt || null,
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
      
      Logger.info(`Security guard approval submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Security guard approval submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting security guard approval', error);
      throw error;
    }
  }

  /**
   * Get security guard approval by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object>} Record details
   */
  async getApprovalById(id) {
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
      Logger.error('Error fetching security guard approval by ID', error);
      throw error;
    }
  }
}

module.exports = new SecurityGuardApprovalService();
