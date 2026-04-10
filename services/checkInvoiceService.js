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

      let whereConditions = ['lrc.planned_6 IS NOT NULL', 'lrc.actual_6 IS NULL', '(lrc.actual_5 IS NOT NULL OR lrc.status_1 = \'Issue\')'];
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
          od.is_order_through,
          od.broker_name,
          od.sku_name,
          od.approval_qty,
          od.order_punch_remarks,
          od.transfer,
          od.bill_company_name,
          od.freight_rate,
          sd.nos_per_main_uom
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        LEFT JOIN sku_details sd ON sd.sku_name = lrc.product_name
        ${whereClause}
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number ASC
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

      let whereConditions = ['lrc.planned_6 IS NOT NULL', 'lrc.actual_6 IS NOT NULL'];
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
        ${whereClause}
        ORDER BY lrc.actual_6 DESC, lrc.d_sr_number ASC
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

      // Step 1: Fetch depository information to check for skipping Stage 11 (Gate Out)
      const infoQuery = `
        SELECT lrc.so_no, od.depo_name 
        FROM lift_receiving_confirmation lrc 
        JOIN order_dispatch od ON lrc.so_no = od.order_no 
        WHERE lrc.id = $1
      `;
      const infoResult = await db.query(infoQuery, [id]);
      const depoName = infoResult.rows[0]?.depo_name || '';

      const updateData = {
        actual_6: data.status_1 === "Issue" ? null : new Date().toISOString(),
        check_invoice_user: data.username || null,
        actual_5: data.status_1 === "Issue" ? null : undefined, // Revert to Make Invoice stage on Issue
        status_1: data.status_1 || null,
        remarks_2: data.remarks_2 || null
      };

      // Step 2: Apply Gate Out skip logic for non-BANARI depots
      // If not an issue and depot is not BANARI, mark Gate Out (Stage 11) as skipped/completed
      if (data.status_1 !== "Issue" && depoName.toUpperCase() !== "BANARI") {
        Logger.info(`Skipping Gate Out (Stage 11) for depot: ${depoName} (Order: ${infoResult.rows[0]?.so_no})`);
        const now = new Date().toISOString();
        updateData.planned_7 = now;
        updateData.actual_7 = now;
        updateData.gate_out_user = data.username || "SYSTEM_SKIP";
      }

      // Remove undefined fields so they don't get set in the query
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });

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
