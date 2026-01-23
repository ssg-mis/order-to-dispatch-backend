/**
 * Order Approval Service
 * Business logic for order approval management (Stage 3: Approval)
 * Conditions:
 * - Pending: planned_2 IS NOT NULL AND actual_2 IS NULL
 * - History: planned_2 IS NOT NULL AND actual_2 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class OrderApprovalService {
  /**
   * Get all fields for order approval
   * @returns {string} Comma-separated field names
   */
  getApprovalFields() {
    return `
      id, timestamp_created, order_no, order_type_delivery_purpose,
      start_date, end_date, delivery_date, order_type, customer_type,
      party_so_date, customer_name, product_name, uom, order_quantity,
      rate_of_material, alternate_uom, alternate_qty_kg, oil_type,
      rate_per_15kg, rate_per_ltr, total_amount_with_gst,
      type_of_transporting, customer_contact_person_name,
      customer_contact_person_whatsapp_no, customer_address,
      payment_terms, advance_payment_to_be_taken, advance_amount,
      is_order_through_broker, broker_name, upload_so,
      planned_1, actual_1, delay_1, sku_name, approval_qty,
      take_required_rates_each_item, remark,
      planned_2, actual_2, delay_2,
      rate_is_rightly_as_per_current_market_rate,
      we_are_dealing_in_ordered_sku, party_credit_status,
      dispatch_date_confirmed, overall_status_of_order,
      order_confirmation_with_customer,
      planned_3, actual_3, delay_3, created_at
    `.replace(/\s+/g, ' ').trim();
  }

  /**
   * Get pending approval orders
   * Pending: planned_2 IS NOT NULL AND actual_2 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending orders
   */
  async getPendingApprovals(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_2 IS NOT NULL', 'actual_2 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
      if (filters.order_no) {
        whereConditions.push(`order_no = $${paramIndex}`);
        queryParams.push(filters.order_no);
        paramIndex++;
      }
      
      if (filters.customer_name) {
        whereConditions.push(`customer_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.customer_name}%`);
        paramIndex++;
      }
      
      if (filters.start_date && filters.end_date) {
        whereConditions.push(`delivery_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        queryParams.push(filters.start_date, filters.end_date);
        paramIndex += 2;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM order_dispatch ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data with all specified fields
      const fields = this.getApprovalFields();
      const dataQuery = `
        SELECT ${fields}
        FROM order_dispatch 
        ${whereClause}
        ORDER BY created_at DESC, order_no ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending approval orders`);
      
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
      Logger.error('Error fetching pending approvals', error);
      throw new Error('Failed to fetch pending approvals');
    }
  }

  /**
   * Get approval history
   * History: planned_2 IS NOT NULL AND actual_2 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History orders
   */
  async getApprovalHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_2 IS NOT NULL', 'actual_2 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
      if (filters.order_no) {
        whereConditions.push(`order_no = $${paramIndex}`);
        queryParams.push(filters.order_no);
        paramIndex++;
      }
      
      if (filters.customer_name) {
        whereConditions.push(`customer_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.customer_name}%`);
        paramIndex++;
      }
      
      if (filters.start_date && filters.end_date) {
        whereConditions.push(`delivery_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        queryParams.push(filters.start_date, filters.end_date);
        paramIndex += 2;
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM order_dispatch ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data with all specified fields
      const fields = this.getApprovalFields();
      const dataQuery = `
        SELECT ${fields}
        FROM order_dispatch 
        ${whereClause}
        ORDER BY actual_2 DESC, order_no ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} approval history records`);
      
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
      Logger.error('Error fetching approval history', error);
      throw new Error('Failed to fetch approval history');
    }
  }

  /**
   * Submit approval (set actual_2 to current timestamp)
   * @param {number} id - Order ID
   * @param {Object} data - Optional additional data to update
   * @returns {Promise<Object>} Updated order
   */
  async submitApproval(id, data = {}) {
    try {
      Logger.info(`submitApproval called for ID: ${id}`, { data });
      
      const updateData = {
        actual_2: new Date().toISOString(),
        ...data
      };
      
      Logger.info(`Update data prepared:`, updateData);
      
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      
      const approvalFields = this.getApprovalFields();
      const query = `
        UPDATE order_dispatch 
        SET ${setClause}
        WHERE id = $${fields.length + 1}
        RETURNING ${approvalFields}
      `;
      
      Logger.info(`Executing update query for ID: ${id}`, { setClause });
      
      const result = await db.query(query, [...values, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Order not found');
      }
      
      Logger.info(`Approval submitted successfully for order ID: ${id}`, { 
        updatedFields: fields,
        rowId: result.rows[0].id 
      });
      
      return {
        success: true,
        message: 'Approval submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting approval', error);
      throw error;
    }
  }

  /**
   * Get approval by order ID
   * @param {number} id - Order ID
   * @returns {Promise<Object>} Order details
   */
  async getApprovalById(id) {
    try {
      const fields = this.getApprovalFields();
      const query = `
        SELECT ${fields}
        FROM order_dispatch 
        WHERE id = $1
      `;
      
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error('Order not found');
      }
      
      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error fetching approval by ID', error);
      throw error;
    }
  }
}

module.exports = new OrderApprovalService();
