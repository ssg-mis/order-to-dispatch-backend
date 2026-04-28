/**
 * Gate In Service
 * Business logic for Gate In workflow stage
 *
 * Pending  = dispatch_drafts that have NO gate_in_records entry yet
 * History  = gate_in_records (completed gate-ins)
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class GateInService {
  /**
   * Get pending gate-ins: orders saved as draft in Actual Dispatch
   * that have not yet been processed through Gate In.
   */
  async getPending(pagination = {}) {
    try {
      const page  = parseInt(pagination.page)  || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM dispatch_drafts dd
        LEFT JOIN gate_in_records gi ON dd.order_key = gi.order_key
        WHERE gi.order_key IS NULL
      `;
      const countResult = await db.query(countQuery);
      const total = parseInt(countResult.rows[0].total);

      const dataQuery = `
        SELECT dd.id, dd.username, dd.order_key, dd.draft_data, dd.saved_at
        FROM dispatch_drafts dd
        LEFT JOIN gate_in_records gi ON dd.order_key = gi.order_key
        WHERE gi.order_key IS NULL
        ORDER BY dd.saved_at DESC
        LIMIT $1 OFFSET $2
      `;
      const dataResult = await db.query(dataQuery, [limit, offset]);

      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('[GATE IN] Error fetching pending', error);
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
