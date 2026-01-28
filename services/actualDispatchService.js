/**
 * Actual Dispatch Service
 * Business logic for actual dispatch management (Stage 5: Actual Dispatch)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_1 IS NOT NULL AND actual_1 IS NULL
 * - History: planned_1 IS NOT NULL AND actual_1 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class ActualDispatchService {
  /**
   * Get pending actual dispatches from lift_receiving_confirmation table
   * Pending: planned_1 IS NOT NULL AND actual_1 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending dispatches
   */
  async getPendingDispatches(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
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
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data with JOIN to order_dispatch for complete order details
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
          od.broker_name,
          od.sku_name,
          od.approval_qty,
          od.rate_is_rightly_as_per_current_market_rate,
          od.we_are_dealing_in_ordered_sku,
          od.party_credit_status,
          od.dispatch_date_confirmed,
          od.overall_status_of_order,
          od.order_confirmation_with_customer
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending actual dispatches`);
      
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
      Logger.error('Error fetching pending actual dispatches', error);
      throw new Error('Failed to fetch pending actual dispatches');
    }
  }

  /**
   * Get actual dispatch history
   * History: planned_1 IS NOT NULL AND actual_1 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History dispatches
   */
  async getDispatchHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;
      
      // Add optional filters
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
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data with JOIN to order_dispatch for complete order details
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
          od.broker_name,
          od.sku_name,
          od.approval_qty,
          od.rate_is_rightly_as_per_current_market_rate,
          od.we_are_dealing_in_ordered_sku,
          od.party_credit_status,
          od.dispatch_date_confirmed,
          od.overall_status_of_order,
          od.order_confirmation_with_customer
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} actual dispatch history records`);
      
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
      Logger.error('Error fetching actual dispatch history', error);
      throw new Error('Failed to fetch actual dispatch history');
    }
  }

  /**
   * Submit actual dispatch
   * Updates actual_1 and related fields in lift_receiving_confirmation table
   * @param {string} dsrNumber - DSR number from lift_receiving_confirmation
   * @param {Object} data - Dispatch data
   * @returns {Promise<Object>} Updated dispatch record
   */
  async submitActualDispatch(dsrNumber, data = {}) {
    try {
      Logger.info(`Submitting actual dispatch for DSR: ${dsrNumber}`, { data });
      
      const updateData = {
        actual_1: new Date().toISOString(),
        product_name_1: data.product_name_1 || null,
        actual_qty_dispatch: data.actual_qty_dispatch || null,
        ...data
      };
      
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      
      const query = `
        UPDATE lift_receiving_confirmation 
        SET ${setClause}
        WHERE d_sr_number = $${fields.length + 1}
        RETURNING *
      `;
      
      Logger.info(`Executing update query for DSR: ${dsrNumber}`, { setClause });
      
      const result = await db.query(query, [...values, dsrNumber]);
      
      if (result.rows.length === 0) {
        throw new Error('Dispatch record not found');
      }
      
      Logger.info(`Actual dispatch submitted successfully for DSR: ${dsrNumber}`);
      
      return {
        success: true,
        message: 'Actual dispatch submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting actual dispatch', error);
      throw error;
    }
  }
}

module.exports = new ActualDispatchService();
