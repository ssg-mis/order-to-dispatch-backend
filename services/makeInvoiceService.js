/**
 * Make Invoice Service
 * Business logic for invoice generation (Stage 9: Make Invoice)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_5 IS NOT NULL AND actual_5 IS NULL
 * - History: planned_5 IS NOT NULL AND actual_5 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class MakeInvoiceService {
  /**
   * Get pending invoice records
   * Pending: planned_5 IS NOT NULL AND actual_5 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending invoice records
   */
  async getPendingInvoices(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_5 IS NOT NULL', 'lrc.actual_5 IS NULL'];
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
          od.final_rate,
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
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending invoices`);
      
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
      Logger.error('Error fetching pending invoices', error);
      throw new Error('Failed to fetch pending invoices');
    }
  }

  /**
   * Get invoice history
   * History: planned_5 IS NOT NULL AND actual_5 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getInvoiceHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_5 IS NOT NULL', 'actual_5 IS NOT NULL'];
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
          planned_5, actual_5,
          bill_type, invoice_date, invoice_no, invoice_copy, qty, bill_amount,
          timestamp
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_5 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} invoice history records`);
      
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
      Logger.error('Error fetching invoice history', error);
      throw new Error('Failed to fetch invoice history');
    }
  }

  /**
   * Submit invoice (set actual_5 and update invoice details)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Invoice data
   * @returns {Promise<Object>} Updated record
   */
  async submitInvoice(id, data = {}) {
    try {
      Logger.info(`Submitting invoice for ID: ${id}`, { data });
      
      const updateData = {
        actual_5: new Date().toISOString(),
        bill_type: data.bill_type || null,
        invoice_date: data.invoice_date || null,
        invoice_no: data.invoice_no || null,
        invoice_copy: data.invoice_copy || null,
        qty: data.qty || null,
        bill_amount: data.bill_amount || null,
        make_invoice_user: data.username || null,
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
      
      Logger.info(`Invoice submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Invoice submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting invoice', error);
      throw error;
    }
  }

  /**
   * Get invoice by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object>} Record details
   */
  async getInvoiceById(id) {
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
      Logger.error('Error fetching invoice by ID', error);
      throw error;
    }
  }
}

module.exports = new MakeInvoiceService();
