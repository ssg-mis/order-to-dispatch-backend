/**
 * Check Invoice Service
 * Business logic for invoice checking (Stage 10: Check Invoice)
 * Uses lift_receiving_confirmation table
 * Conditions:
 * - Pending: planned_6 IS NOT NULL AND actual_6 IS NULL
 * - History: planned_6 IS NOT NULL AND actual_6 IS NOT NULL
 */

const db = require('../config/db');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { resolveAuditUsers } = require('../utils/auditUserResolver');
const { Logger } = require('../utils');
const { applyDispatchFilters } = require('../utils/searchUtils');

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

      // Search (DO No. / Customer), Manual Sauda No. and DO Date range filters
      paramIndex = applyDispatchFilters(filters, whereConditions, queryParams, paramIndex);

      if (filters.party_name) {
        whereConditions.push(`lrc.party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Count total (join order_dispatch so Manual Sauda No. / DO Date filters apply)
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name ${whereClause}`;
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
          od.depo_name,
          od.customer_delivery_address,
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
          sd.nos_per_main_uom,
          COALESCE(NULLIF(lrc.fitness, 'pending'), vm.fitness_image) AS fitness,
          COALESCE(lrc.fitness_end_date, vm.fitness) AS fitness_end_date,
          COALESCE(NULLIF(lrc.polution, 'pending'), vm.pollution_image) AS polution,
          COALESCE(lrc.pollution_end_date, vm.pollution) AS pollution_end_date,
          COALESCE(NULLIF(lrc.insurance, 'pending'), vm.insurance_image) AS insurance,
          COALESCE(lrc.insurance_end_date, vm.insurance) AS insurance_end_date,
          COALESCE(NULLIF(lrc.tax_copy, 'pending'), vm.road_tax_image) AS tax_copy,
          COALESCE(lrc.tax_end_date, vm.road_tax) AS tax_end_date,
          COALESCE(NULLIF(lrc.permit1, 'pending'), vm.state_permit_image) AS permit1,
          COALESCE(lrc.permit1_end_date, vm.state_permit) AS permit1_end_date,
          NULLIF(lrc.permit2_out_state, 'pending') AS permit2_out_state
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name
        LEFT JOIN sku_details sd ON sd.sku_name = lrc.product_name
        LEFT JOIN vehicle_master vm ON TRIM(UPPER(lrc.truck_no)) = TRIM(UPPER(vm.registration_no))
        ${whereClause}
        ORDER BY lrc.timestamp DESC, lrc.d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      await resolveAuditUsers(dataResult.rows);

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

      // Search (DO No. / Customer), Manual Sauda No. and DO Date range filters
      paramIndex = applyDispatchFilters(filters, whereConditions, queryParams, paramIndex);

      if (filters.party_name) {
        whereConditions.push(`lrc.party_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.party_name}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Count total (join order_dispatch so Manual Sauda No. / DO Date filters apply)
      const countQuery = `SELECT COUNT(*) FROM lift_receiving_confirmation lrc LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name ${whereClause}`;
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
          od.depo_name,
          od.customer_delivery_address,
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
          od.bill_company_name,
          COALESCE(NULLIF(lrc.fitness, 'pending'), vm.fitness_image) AS fitness,
          COALESCE(lrc.fitness_end_date, vm.fitness) AS fitness_end_date,
          COALESCE(NULLIF(lrc.polution, 'pending'), vm.pollution_image) AS polution,
          COALESCE(lrc.pollution_end_date, vm.pollution) AS pollution_end_date,
          COALESCE(NULLIF(lrc.insurance, 'pending'), vm.insurance_image) AS insurance,
          COALESCE(lrc.insurance_end_date, vm.insurance) AS insurance_end_date,
          COALESCE(NULLIF(lrc.tax_copy, 'pending'), vm.road_tax_image) AS tax_copy,
          COALESCE(lrc.tax_end_date, vm.road_tax) AS tax_end_date,
          COALESCE(NULLIF(lrc.permit1, 'pending'), vm.state_permit_image) AS permit1,
          COALESCE(lrc.permit1_end_date, vm.state_permit) AS permit1_end_date,
          NULLIF(lrc.permit2_out_state, 'pending') AS permit2_out_state
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name
        LEFT JOIN vehicle_master vm ON TRIM(UPPER(lrc.truck_no)) = TRIM(UPPER(vm.registration_no))
        ${whereClause}
        ORDER BY lrc.actual_6 DESC, lrc.d_sr_number ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
      await resolveAuditUsers(dataResult.rows);

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
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      Logger.info(`Submitting check invoice for ID: ${id}`, { data });
      await this.ensurePlanned7TriggerUsesTat(client);

      // Step 1: Fetch depository information to check for skipping Stage 11 (Gate Out)
      const infoQuery = `
        SELECT lrc.so_no, lrc.actual_5, od.depo_name
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no AND lrc.product_name = od.product_name
        WHERE lrc.id = $1
      `;
      const infoResult = await client.query(infoQuery, [id]);

      // Guard: a record can only be verified (non-"Issue") once Make Invoice has
      // actually (re-)completed it (actual_5 set). Without this, a record that was
      // reported as an "Issue" (actual_5 reset to NULL, awaiting re-issue from Make
      // Invoice) could be verified a second time directly from Check Invoice —
      // e.g. via a stale/batched selection that hasn't picked up the "Issue" status
      // yet — leaving actual_6 set while actual_5 stays NULL forever. That silently
      // corrupts the record: it looks "done" in Check Invoice history while also
      // still sitting in Make Invoice's pending queue.
      if (data.status_1 !== "Issue" && !infoResult.rows[0]?.actual_5) {
        throw new Error('This record has not been (re-)issued from Make Invoice yet and cannot be verified. It may still be awaiting correction after a reported issue.');
      }

      const depoName = infoResult.rows[0]?.depo_name || '';
      const planned7 = data.status_1 === "Issue" ? undefined : await this.getPlannedTimestamp(client, 'Gate Out');

      const updateData = {
        actual_6: data.status_1 === "Issue" ? null : new Date().toISOString(),
        planned_7: planned7,
        check_invoice_user: data.user_id || null,
        actual_5: data.status_1 === "Issue" ? null : undefined, // Revert to Make Invoice stage on Issue
        status_1: data.status_1 || null,
        remarks_2: data.remarks_2 || null
      };

      // Step 2: Apply Gate Out skip logic for non-BANARI depots
      // If not an issue and depot is not BANARI, mark Gate Out (Stage 11) as skipped/completed
      if (data.status_1 !== "Issue" && depoName.toUpperCase() !== "BANARI") {
        Logger.info(`Skipping Gate Out (Stage 11) for depot: ${depoName} (Order: ${infoResult.rows[0]?.so_no})`);
        const now = new Date().toISOString();
        updateData.actual_7 = now;
        updateData.gate_out_user = data.user_id || null;
      }

      // Remove undefined fields so they don't get set in the query
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });

      const fields = Object.keys(updateData);
      const values = Object.values(updateData);

      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

      // Stale-write guard: only act on a row still pending at Check Invoice (actual_6 NULL).
      // Covers both branches — a verify (sets actual_6) or an Issue (leaves actual_6 NULL)
      // cannot land on a record another user already verified.
      const query = `
        UPDATE lift_receiving_confirmation
        SET ${setClause}
        WHERE id = $${fields.length + 1} AND actual_6 IS NULL
        RETURNING *
      `;

      const result = await client.query(query, [...values, id]);

      assertStageOpen(result, 'Check Invoice');

      await client.query('COMMIT');
      Logger.info(`Check invoice submitted successfully for ID: ${id}`);

      return {
        success: true,
        message: 'Check invoice submitted successfully',
        data: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error submitting check invoice', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPlannedTimestamp(client, stageName) {
    const normalizeStageName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedStageName = normalizeStageName(stageName);
    const stageAliases = {
      gateout: ['gateout'],
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

  async ensurePlanned7TriggerUsesTat(client) {
    await client.query(`
      CREATE OR REPLACE FUNCTION set_planned_7_from_actual_6()
      RETURNS TRIGGER AS $$
      DECLARE
          gate_out_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO gate_out_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'gateout'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_6 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_6 IS DISTINCT FROM NEW.actual_6) THEN
              NEW.planned_7 := NEW.actual_6::timestamptz + COALESCE(gate_out_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}

module.exports = new CheckInvoiceService();
