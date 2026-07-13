/**
 * Gate In Service
 * Business logic for Gate In workflow stage
 *
 * Pending  = dispatch_drafts that have NO gate_in_records entry yet
 * History  = gate_in_records (completed gate-ins)
 */

const db = require('../config/db');
const { Logger } = require('../utils');
const { buildSearchCondition } = require('../utils/searchUtils');

class GateInService {
  /**
   * Get pending gate-ins: orders saved as draft in Actual Dispatch
   * that have not yet been processed through Gate In.
   */
  async getPending(filters = {}, pagination = {}) {
    try {
      const page  = parseInt(pagination.page)  || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      let whereConditions = ['gi.order_key IS NULL'];
      let queryParams = [];
      let paramIndex = 1;

      // DO Number search only
      if (filters.search) {
        const { clause, params, newIndex } = buildSearchCondition(['dd.order_key'], filters.search, paramIndex);
        whereConditions.push(clause);
        queryParams.push(...params);
        paramIndex = newIndex;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM (
          SELECT DISTINCT dd.order_key
          FROM dispatch_drafts dd
          LEFT JOIN gate_in_records gi ON dd.order_key = gi.order_key
          ${whereClause}
        ) sub
      `;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // dispatch_drafts is unique on order_key, so DISTINCT ON is just defensive.
      // LATERAL join fetches one representative order row (from lrc + od) per draft
      // so the frontend can display actual-dispatch columns without a separate API call.
      const dataQuery = `
        SELECT * FROM (
          SELECT DISTINCT ON (dd.order_key)
            dd.id, dd.username, dd.order_key, dd.draft_data, dd.saved_at,
            ord.party_name, ord.so_no, ord.processid, ord.product_name,
            ord.qty_to_be_dispatched, ord.dispatch_from, ord.uom,
            ord.order_quantity, ord.alternate_uom, ord.alternate_qty_kg,
            ord.party_so_date, ord.order_type, ord.customer_type,
            ord.order_type_delivery_purpose, ord.delivery_date,
            ord.start_date, ord.end_date, ord.oil_type,
            ord.rate_per_15kg, ord.rate_per_ltr, ord.rate_of_material,
            ord.final_rate, ord.total_amount_with_gst,
            ord.freight_rate, ord.depo_name,
            ord.type_of_transporting, ord.customer_contact_person_name,
            ord.customer_contact_person_whatsapp_no, ord.customer_address,
            ord.payment_terms, ord.advance_payment_to_be_taken,
            ord.advance_amount, ord.is_order_through_broker,
            ord.broker_name, ord.order_punch_remarks,
            ord.sku_name, ord.approval_qty, ord.nos_per_main_uom
          FROM dispatch_drafts dd
          LEFT JOIN gate_in_records gi ON dd.order_key = gi.order_key
          LEFT JOIN LATERAL (
            SELECT
              lrc.party_name, lrc.so_no, lrc.processid, lrc.product_name,
              lrc.qty_to_be_dispatched, lrc.dispatch_from,
              od.uom, od.order_quantity, od.alternate_uom, od.alternate_qty_kg,
              od.party_so_date, od.order_type, od.customer_type,
              od.order_type_delivery_purpose, od.delivery_date,
              od.start_date, od.end_date, od.oil_type,
              od.rate_per_15kg, od.rate_per_ltr, od.rate_of_material,
              od.final_rate, od.total_amount_with_gst,
              od.freight_rate, od.depo_name,
              od.type_of_transporting, od.customer_contact_person_name,
              od.customer_contact_person_whatsapp_no, od.customer_address,
              od.payment_terms, od.advance_payment_to_be_taken,
              od.advance_amount, od.is_order_through_broker,
              od.broker_name, od.order_punch_remarks,
              od.sku_name, od.approval_qty,
              sd.nos_per_main_uom
            FROM lift_receiving_confirmation lrc
            LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name
            LEFT JOIN sku_details sd ON sd.sku_name = lrc.product_name
            WHERE lrc.so_no ILIKE dd.order_key || '%'
            LIMIT 1
          ) ord ON true
          ${whereClause}
          ORDER BY dd.order_key, dd.saved_at DESC
        ) deduped
        ORDER BY saved_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching pending', error.message || error);
      throw new Error('Failed to fetch pending gate-ins');
    }
  }

  /**
   * Get completed gate-ins with their draft data for context.
   */
  async getHistory(pagination = {}) {
    try {
      const page  = parseInt(pagination.page)  || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      const countQuery = `SELECT COUNT(*) as total FROM gate_in_records`;
      const countResult = await db.query(countQuery);
      const total = parseInt(countResult.rows[0].total);

      const dataQuery = `
        SELECT
          gi.id,
          gi.order_key,
          gi.username,
          gi.front_vehicle_image,
          gi.back_vehicle_image,
          gi.driver_photo,
          gi.submitted_at,
          dd.draft_data
        FROM gate_in_records gi
        LEFT JOIN dispatch_drafts dd ON gi.order_key = dd.order_key
        ORDER BY gi.submitted_at DESC
        LIMIT $1 OFFSET $2
      `;
      const dataResult = await db.query(dataQuery, [limit, offset]);

      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching history', error);
      throw new Error('Failed to fetch gate-in history');
    }
  }

  /**
   * Submit a gate-in entry (upsert by order_key).
   */
  async submitGateIn(orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto) {
    try {
      const query = `
        INSERT INTO gate_in_records (order_key, username, front_vehicle_image, back_vehicle_image, driver_photo, gatepass_photo, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (order_key)
        DO UPDATE SET
          username             = EXCLUDED.username,
          front_vehicle_image  = EXCLUDED.front_vehicle_image,
          back_vehicle_image   = EXCLUDED.back_vehicle_image,
          driver_photo         = EXCLUDED.driver_photo,
          gatepass_photo       = EXCLUDED.gatepass_photo,
          submitted_at         = NOW()
        RETURNING *
      `;
      const result = await db.query(query, [orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto]);
      Logger.info(`[GATE IN] Submitted gate-in for order_key=${orderKey}`);
      return { success: true, data: result.rows[0] };
    } catch (error) {
      Logger.error('[GATE IN] Error submitting gate-in', error);
      throw new Error('Failed to submit gate-in');
    }
  }

  /**
   * Get gate-in record by order_key (used by Actual Dispatch to check status).
   */
  async getByOrderKey(orderKey) {
    try {
      const query = `SELECT * FROM gate_in_records WHERE order_key = $1 LIMIT 1`;
      const result = await db.query(query, [orderKey]);
      return { success: true, data: result.rows[0] || null };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching by order_key', error);
      throw new Error('Failed to fetch gate-in record');
    }
  }
}

module.exports = new GateInService();
