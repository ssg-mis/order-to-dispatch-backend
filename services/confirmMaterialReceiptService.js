/**
 * Confirm Material Receipt Service
 * Business logic for material receipt confirmation (Stage 12: Confirm Material Receipt)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_8 IS NOT NULL AND actual_8 IS NULL
 * - History: planned_8 IS NOT NULL AND actual_8 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class ConfirmMaterialReceiptService {
  /**
   * Get pending material receipt records
   * Pending: planned_8 IS NOT NULL AND actual_8 IS NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending records
   */
  async getPendingReceipts(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['lrc.planned_8 IS NOT NULL', 'lrc.actual_8 IS NULL'];
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
          od.order_punch_remarks,
          od.rate_of_material,
          sd.nos_per_main_uom
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        LEFT JOIN sku_details sd ON sd.sku_name = lrc.product_name
        ${whereClause}
        ORDER BY lrc.planned_8 ASC, lrc.d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} pending material receipts`);
      
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
      Logger.error('Error fetching pending material receipts', error);
      throw new Error('Failed to fetch pending material receipts');
    }
  }

  /**
   * Get material receipt history
   * History: planned_8 IS NOT NULL AND actual_8 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History records
   */
  async getReceiptHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 1000;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['planned_8 IS NOT NULL', 'actual_8 IS NOT NULL'];
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
          planned_8, actual_8,
          material_received_date, damage_status, remarks_3,
          timestamp, invoice_no
        FROM lift_receiving_confirmation 
        ${whereClause}
        ORDER BY actual_8 DESC, d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      
      Logger.info(`Fetched ${dataResult.rows.length} material receipt history records`);
      
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
      Logger.error('Error fetching material receipt history', error);
      throw new Error('Failed to fetch material receipt history');
    }
  }

  /**
   * Submit material receipt (set actual_8 and details)
   * @param {number} id - Record ID from lift_receiving_confirmation
   * @param {Object} data - Receipt data
   * @returns {Promise<Object>} Updated record
   */
  async submitReceipt(id, data = {}) {
    try {
      Logger.info(`Submitting material receipt for ID: ${id}`, { data });
      
      const updateData = {
        actual_8: new Date().toISOString(),
        material_receipt_user: data.username || null,
        material_received_date: data.material_received_date || null,
        received_image_proof: data.received_image_proof || null,
        damage_status: data.damage_status || null,
        sku: data.sku || null,
        damage_qty: data.damage_qty || null,
        damage_image: data.damage_image || null,
        remarks_3: data.remarks_3 || null,
        bill_amount: data.bill_amount !== undefined ? data.bill_amount : null,
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
      
      Logger.info(`Material receipt submitted successfully for ID: ${id}`);
      
      return {
        success: true,
        message: 'Material receipt submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error('Error submitting material receipt', error);
      throw error;
    }
  }
}

module.exports = new ConfirmMaterialReceiptService();
