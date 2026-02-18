/**
 * Damage Adjustment Service
 * Business logic for damage adjustment (Stage 13: Damage Adjustment)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_9 IS NOT NULL AND actual_9 IS NULL
 * - History: planned_9 IS NOT NULL AND actual_9 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class DamageAdjustmentService {
  /**
   * Get pending damage adjustment records
   * Pending: planned_9 IS NOT NULL AND actual_9 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending records
   */
  async getPendingAdjustments(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_9 IS NOT NULL', 'lrc.actual_9 IS NULL'];
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
      
      // Get data
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
          od.order_punch_remarks
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        ORDER BY lrc.planned_9 ASC, lrc.d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending damage adjustments`);
      
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
      Logger.error('Error fetching pending damage adjustments', error);
      throw new Error('Failed to fetch pending damage adjustments');
    }
  }

  /**
   * Get damage adjustment history
   * History: planned_9 IS NOT NULL AND actual_9 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getAdjustmentHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_9 IS NOT NULL', 'actual_9 IS NOT NULL'];
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
          planned_9, actual_9, delay_9,
          status_2, credit_note_no, net_banalce,
          timestamp, invoice_no
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_9 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} damage adjustment history records`);
      
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
      Logger.error('Error fetching damage adjustment history', error);
      throw new Error('Failed to fetch damage adjustment history');
    }
  }

  /**
   * Submit damage adjustment (set actual_9 and details)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Adjustment data
   * @returns {Promise<Object>} Updated record
   */
  async submitAdjustment(id, data = {}) {
    try {
      Logger.info(`Submitting damage adjustment for ID: ${id}`, { data });
      
      const updateData = {
        actual_9: new Date().toISOString(), // Adjustment Timestamp
        delay_9: data.delay_9 || null,
        status_2: data.status_2 || null, // Final Status
        credit_note_date: data.credit_note_date || null,
        credit_note_no: data.credit_note_no || null,
        credit_note_copy: data.credit_note_copy || null,
        credit_note_qty: data.credit_note_qty || null,
        credit_note_amount: data.credit_note_amount || null,
        net_banalce: data.net_banalce || null
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
      
      Logger.info(`Damage adjustment submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Damage adjustment submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting damage adjustment', error);
      throw error;
    }
  }
}

module.exports = new DamageAdjustmentService();
