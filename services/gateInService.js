/**
 * Gate In Service — v2 schema.
 *
 * Pending = dispatch_drafts (Actual-Dispatch drafts) with NO gate_in_records
 *           row yet. History = gate_in_records (completed gate-ins).
 * Both aux tables (dispatch_drafts, gate_in_records) are now real v2 tables
 * (backfilled from staging); dispatch_drafts is shared with draftService, so
 * the two were migrated together.
 *
 * The pending list's per-draft "representative order row" (was a LATERAL over
 * lift_receiving_confirmation + order_dispatch + sku_details for display
 * context) is reproduced from v2 orders→order_items→dispatches + masters. The
 * order_key is the base DO (== orders.order_no), so the old
 * `lrc.so_no ILIKE order_key||'%'` match becomes `orders.order_no ILIKE …`.
 */

const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, sql } = require('drizzle-orm');
const { Logger } = require('../utils');
const { toSnakeCase } = require('./masterLookupHelper');

class GateInService {
  async getPending(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      const searchClause = filters.search
        ? sql`AND dd.order_key ILIKE ${'%' + filters.search + '%'}`
        : sql``;

      const countRes = await dbV2.execute(sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT dd.order_key
          FROM dispatch_drafts dd
          LEFT JOIN gate_in_records gi ON dd.order_key = gi.order_key
          WHERE gi.order_key IS NULL ${searchClause}
        ) sub
      `);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const dataRes = await dbV2.execute(sql`
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
              c.customer_name AS party_name, o.order_no AS so_no, o.manual_sauda_no AS processid,
              s.sku_name AS product_name, d.qty_to_be_dispatched, d.dispatch_from,
              oi.uom, oi.order_quantity, oi.alternate_uom, oi.alternate_qty_kg,
              o.party_so_date, o.order_type, o.customer_type,
              o.delivery_purpose AS order_type_delivery_purpose, o.delivery_date,
              o.start_date, o.end_date, oi.oil_type,
              oi.rate_per_15kg, oi.rate_per_ltr, oi.rate_of_material, oi.final_rate,
              NULL::numeric AS total_amount_with_gst,
              o.freight_rate, dep.depot_name AS depo_name,
              o.type_of_transporting, o.customer_contact_person_name,
              o.customer_contact_person_whatsapp_no, o.customer_address,
              o.payment_terms, o.advance_payment_to_be_taken, o.advance_amount,
              (o.order_through IN ('Broker','Salesperson')) AS is_order_through_broker,
              b.broker_name, o.order_punch_remarks,
              s.sku_name AS sku_name, oi.approved_qty AS approval_qty, s.nos_per_main_uom
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN dispatches d ON d.order_item_id = oi.id
            LEFT JOIN customers c ON c.id = o.customer_id
            LEFT JOIN depots dep ON dep.id = o.depot_id
            LEFT JOIN brokers b ON b.id = o.broker_id
            LEFT JOIN skus s ON s.id = oi.sku_id
            WHERE o.order_no ILIKE dd.order_key || '%'
            LIMIT 1
          ) ord ON true
          WHERE gi.order_key IS NULL ${searchClause}
          ORDER BY dd.order_key, dd.saved_at DESC
        ) deduped
        ORDER BY party_so_date DESC, so_no DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      return {
        success: true,
        data: dataRes.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching pending', error.message || error);
      throw new Error('Failed to fetch pending gate-ins');
    }
  }

  async getHistory(pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      const countRes = await dbV2.execute(sql`SELECT COUNT(*)::int AS total FROM gate_in_records`);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const dataRes = await dbV2.execute(sql`
        SELECT
          gi.id, gi.order_key, gi.username,
          gi.front_vehicle_image, gi.back_vehicle_image, gi.driver_photo,
          gi.submitted_at, dd.draft_data
        FROM gate_in_records gi
        LEFT JOIN dispatch_drafts dd ON gi.order_key = dd.order_key
        ORDER BY gi.submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      return {
        success: true,
        data: dataRes.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching history', error);
      throw new Error('Failed to fetch gate-in history');
    }
  }

  async submitGateIn(orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto) {
    try {
      const [row] = await dbV2
        .insert(schema.gateInRecords)
        .values({ orderKey, username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto, submittedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.gateInRecords.orderKey,
          set: { username, frontVehicleImage, backVehicleImage, driverPhoto, gatepassPhoto, submittedAt: new Date() },
        })
        .returning();
      Logger.info(`[GATE IN] Submitted gate-in for order_key=${orderKey}`);
      // snake_case out — the old `SELECT * ... RETURNING *` returned snake columns
      return { success: true, data: toSnakeCase(row) };
    } catch (error) {
      Logger.error('[GATE IN] Error submitting gate-in', error);
      throw new Error('Failed to submit gate-in');
    }
  }

  async getByOrderKey(orderKey) {
    try {
      const [row] = await dbV2.select().from(schema.gateInRecords).where(eq(schema.gateInRecords.orderKey, orderKey));
      // snake_case out — actual-dispatch reads front_vehicle_image/driver_photo/etc.
      return { success: true, data: row ? toSnakeCase(row) : null };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching by order_key', error);
      throw new Error('Failed to fetch gate-in record');
    }
  }
}

module.exports = new GateInService();
