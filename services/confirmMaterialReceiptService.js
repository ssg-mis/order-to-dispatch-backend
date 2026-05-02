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

      // Add filters
      if (filters.d_sr_number) {
        whereConditions.push(`lrc.d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }

      if (filters.so_no) {
        // Enhanced search: match so_no OR party_name if only one search string is given
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex} OR lrc.invoice_no ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.so_no}%`);
        paramIndex++;
      } else if (filters.party_name) {
        whereConditions.push(`lrc.party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
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

      // Count total (needs join for depo_name filter)
      const countQuery = `
        SELECT COUNT(*) 
        FROM lift_receiving_confirmation lrc 
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
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
          od.rate_of_material,
          od.transfer,
          od.bill_company_name,
          sd.nos_per_main_uom
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        LEFT JOIN sku_details sd ON sd.sku_name = lrc.product_name
        ${whereClause}
        ORDER BY lrc.planned_8 DESC, lrc.id DESC
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

      let whereConditions = ['lrc.planned_8 IS NOT NULL', 'lrc.actual_8 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;

      // Add filters
      if (filters.d_sr_number) {
        whereConditions.push(`lrc.d_sr_number = $${paramIndex}`);
        queryParams.push(filters.d_sr_number);
        paramIndex++;
      }

      if (filters.so_no) {
        // Enhanced search: match so_no OR party_name if only one search string is given
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex} OR lrc.invoice_no ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.so_no}%`);
        paramIndex++;
      } else if (filters.party_name) {
        whereConditions.push(`lrc.party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
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

      // Count total (needs join for depo_name filter)
      const countQuery = `
        SELECT COUNT(*) 
        FROM lift_receiving_confirmation lrc 
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
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
        ORDER BY lrc.actual_8 DESC, lrc.id DESC
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
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      Logger.info(`Submitting material receipt for ID: ${id}`, { data });
      await this.ensurePlanned9TriggerUsesTat(client);
      const isDamaged = String(data.damage_status || '').toLowerCase().trim() === 'damaged';

      const updateData = {
        actual_8: new Date().toISOString(),
        planned_9: isDamaged ? await this.getPlannedTimestamp(client, 'Damage Adjustment') : null,
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

      const result = await client.query(query, [...values, id]);

      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }

      await client.query('COMMIT');
      Logger.info(`Material receipt submitted successfully for ID: ${id}`);

      return {
        success: true,
        message: 'Material receipt submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error submitting material receipt', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPlannedTimestamp(client, stageName) {
    const normalizeStageName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedStageName = normalizeStageName(stageName);
    const stageAliases = {
      damageadjustment: ['damageadjustment'],
    };
    const normalizedStageNames = stageAliases[normalizedStageName] || [normalizedStageName];

    const result = await client.query(
      `
        SELECT (
          CURRENT_TIMESTAMP + COALESCE(
            (
              SELECT stage_time
              FROM process_stages
              WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = ANY($1::text[])
              ORDER BY submitted_at DESC, id DESC
              LIMIT 1
            ),
            INTERVAL '0'
          )
        ) AS planned_at
      `,
      [normalizedStageNames]
    );

    const plannedAt = result.rows[0]?.planned_at;
    return plannedAt instanceof Date ? plannedAt.toISOString() : new Date(plannedAt).toISOString();
  }

  async ensurePlanned9TriggerUsesTat(client) {
    await client.query(`
      CREATE OR REPLACE FUNCTION set_planned_9_from_actual_8()
      RETURNS TRIGGER AS $$
      DECLARE
          damage_adjustment_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO damage_adjustment_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'damageadjustment'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_8 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_8 IS DISTINCT FROM NEW.actual_8)
             AND lower(trim(COALESCE(NEW.damage_status, ''))) = 'damaged' THEN
              NEW.planned_9 := NEW.actual_8::timestamptz + COALESCE(damage_adjustment_tat, INTERVAL '0');
          ELSIF lower(trim(COALESCE(NEW.damage_status, ''))) <> 'damaged' THEN
              NEW.planned_9 := NULL;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}

module.exports = new ConfirmMaterialReceiptService();
