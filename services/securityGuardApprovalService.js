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
   * Get unique filter options for Security Guard stage
   * @returns {Promise<Object>} Object containing customer names and depots
   */
  async getFilterOptions() {
    try {
      // Get unique customer names from pending items
      const customerQuery = `
        SELECT DISTINCT party_name 
        FROM lift_receiving_confirmation 
        WHERE planned_4 IS NOT NULL AND actual_4 IS NULL
        ORDER BY party_name ASC
      `;
      const customerResult = await db.query(customerQuery);

      // Get unique depots from pending items
      const depoQuery = `
        SELECT DISTINCT od.depo_name
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL
        ORDER BY od.depo_name ASC
      `;
      const depoResult = await db.query(depoQuery);

      return {
        success: true,
        data: {
          customerNames: customerResult.rows.map(r => r.party_name),
          depots: depoResult.rows.map(r => r.depo_name)
        }
      };
    } catch (error) {
      Logger.error('Error fetching security guard filter options', error);
      return { success: false, message: 'Failed to fetch filter options' };
    }
  }

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
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      const baseDoExp = `COALESCE(substring(lrc.so_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), lrc.so_no)`;

      let whereConditions = ['lrc.planned_4 IS NOT NULL', 'lrc.actual_4 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;

      if (filters.search) {
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex} OR lrc.truck_no ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`lrc.party_name = $${paramIndex}`);
        queryParams.push(filters.customer_name);
        paramIndex++;
      }

      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        if (filters.depo_names.length === 0) {
          whereConditions.push('1=0');
        } else {
          whereConditions.push(`od.depo_name = ANY($${paramIndex})`);
          queryParams.push(filters.depo_names);
          paramIndex++;
        }
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Step 1: Get paginated Base DOs using CTE for grouping
      const groupQuery = `
        SELECT ${baseDoExp} as base_do, MIN(lrc.timestamp) as sort_date
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        GROUP BY base_do
        ORDER BY sort_date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const groupResult = await db.query(groupQuery, [...queryParams, limit, offset]);
      const baseDos = groupResult.rows.map(r => r.base_do);

      if (baseDos.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      // Step 2: Get total count of groups
      const countQuery = `
        SELECT COUNT(DISTINCT ${baseDoExp}) as total
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Step 3: Fetch all rows for these Base DOs
      const dataQuery = `
        SELECT 
          lrc.*,
          od.order_type_delivery_purpose,
          od.start_date,
          od.end_date,
          od.delivery_date,
          od.order_type,
          od.customer_type,
          od.party_so_date,
          od.oil_type,
          od.rate_per_15kg,
          od.rate_per_ltr,
          od.rate_of_material,
          od.total_amount_with_gst,
          od.type_of_transporting,
          od.customer_contact_person_name,
          od.customer_contact_person_whatsapp_no,
          od.customer_address,
          od.payment_terms,
          od.advance_payment_to_be_taken,
          od.advance_amount,
          od.is_order_through_broker,
          od.is_order_through,
          od.broker_name,
          od.sku_name,
          od.approval_qty,
          od.order_punch_remarks,
          od.actual_1 AS order_actual_1,
          od.transfer,
          od.bill_company_name
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE ${baseDoExp} = ANY($1)
          AND lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number ASC
      `;

      const dataResult = await db.query(dataQuery, [baseDos]);

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
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      const baseDoExp = `COALESCE(substring(lrc.so_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), lrc.so_no)`;

      let whereConditions = ['lrc.planned_4 IS NOT NULL', 'lrc.actual_4 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;

      if (filters.search) {
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex} OR lrc.truck_no ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`lrc.party_name = $${paramIndex}`);
        queryParams.push(filters.customer_name);
        paramIndex++;
      }

      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        if (filters.depo_names.length === 0) {
          whereConditions.push('1=0');
        } else {
          whereConditions.push(`od.depo_name = ANY($${paramIndex})`);
          queryParams.push(filters.depo_names);
          paramIndex++;
        }
      }

      // Add date range filters for history
      if (filters.start_date) {
        whereConditions.push(`lrc.actual_4 >= $${paramIndex}`);
        queryParams.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        whereConditions.push(`lrc.actual_4 <= $${paramIndex}::timestamp + interval '1 day'`);
        queryParams.push(filters.end_date);
        paramIndex++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Step 1: Get paginated Base DOs
      const groupQuery = `
        SELECT ${baseDoExp} as base_do, MAX(lrc.actual_4) as sort_date
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        GROUP BY base_do
        ORDER BY sort_date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const groupResult = await db.query(groupQuery, [...queryParams, limit, offset]);
      const baseDos = groupResult.rows.map(r => r.base_do);

      if (baseDos.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      // Step 2: Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT ${baseDoExp}) as total
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Step 3: Fetch rows
      const dataQuery = `
        SELECT 
          lrc.*,
          od.order_type_delivery_purpose,
          od.start_date,
          od.end_date,
          od.delivery_date,
          od.order_type,
          od.customer_type,
          od.party_so_date,
          od.oil_type,
          od.rate_per_15kg,
          od.rate_per_ltr,
          od.rate_of_material,
          od.total_amount_with_gst,
          od.type_of_transporting,
          od.customer_contact_person_name,
          od.customer_contact_person_whatsapp_no,
          od.customer_address,
          od.payment_terms,
          od.advance_payment_to_be_taken,
          od.advance_amount,
          od.is_order_through_broker,
          od.is_order_through,
          od.broker_name,
          od.sku_name,
          od.approval_qty,
          od.order_punch_remarks,
          od.actual_1 AS order_actual_1,
          od.transfer,
          od.bill_company_name
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE ${baseDoExp} = ANY($1)
          AND lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NOT NULL
        ORDER BY lrc.actual_4 DESC, lrc.d_sr_number ASC
      `;

      const dataResult = await db.query(dataQuery, [baseDos]);

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

      let updateData = {};

      if (data.verdict_status === 'REJECT') {
        updateData = {
          actual_1: null,
          actual_4: null,
          security_guard_status: 'REJECT',
          security_guard_user: data.username || null,
          revert_security_remarks: data.remarks || null,
        };
      } else {
        updateData = {
          actual_4: new Date().toISOString(),
          bilty_no: data.bilty_no || null,
          bilty_image: data.bilty_image || null,
          vehicle_image_attachemrnt: data.vehicle_image_attachemrnt || null,
          security_guard_user: data.username || null,
          security_guard_status: 'APPROVE',
        };
      }

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
