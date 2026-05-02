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
const { deriveRatesForRegularOrder, deriveConsolidatedRatesForGroup, detectOilType } = require('../utils/rateDerivation');

class ActualDispatchService {
  /**
   * Get pending actual dispatches from lift_receiving_confirmation table
   * Pending: planned_1 IS NOT NULL AND actual_1 IS NULL
   * @param {Object} filters - 
   * Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending dispatches
   */
  async getPendingDispatches(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      const baseDoExp = `COALESCE(substring(lrc.so_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), lrc.so_no)`;

      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;

      if (filters.search) {
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`lrc.party_name = $${paramIndex}`);
        queryParams.push(filters.customer_name);
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

      // Step 1: Get paginated Base DOs using CTE for grouping
      const groupQuery = `
        SELECT ${baseDoExp} as base_do, MIN(lrc.timestamp) as sort_date
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        GROUP BY base_do
        ORDER BY sort_date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const groupResult = await db.query(groupQuery, [...queryParams, limit, offset]);
      const baseDos = groupResult.rows.map(r => r.base_do);

      if (baseDos.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      // Step 2: Get total count of groups
      const countQuery = `
        SELECT COUNT(DISTINCT ${baseDoExp}) as total
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Step 3: Fetch all rows for these Base DOs
      // Re-create where conditions with shifted indices because $1 is now reserved for baseDos
      let dataWhereConditions = [`${baseDoExp} = ANY($1)`];
      let dataParamIndex = 2;
      
      if (filters.search) {
        dataWhereConditions.push(`(lrc.so_no ILIKE $${dataParamIndex} OR lrc.party_name ILIKE $${dataParamIndex})`);
        dataParamIndex++;
      }
      if (filters.customer_name) {
        dataWhereConditions.push(`lrc.party_name = $${dataParamIndex}`);
        dataParamIndex++;
      }
      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        dataWhereConditions.push(`od.depo_name = ANY($${dataParamIndex})`);
        dataParamIndex++;
      }

      const dataQuery = `
        SELECT 
          lrc.*,
          EXISTS(SELECT 1 FROM gate_in_records gi WHERE gi.order_key = ${baseDoExp}) as has_gate_in,
          EXISTS(SELECT 1 FROM dispatch_drafts dd WHERE dd.order_key = ${baseDoExp}) as has_draft,
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
          od.order_punch_remarks,
          od.final_rate,
          od.overall_status_of_order,
          od.transfer,
          od.bill_company_name,
          od.depo_name
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE ${dataWhereConditions.join(' AND ')}
        AND lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL
        ORDER BY lrc.timestamp DESC, lrc.so_no ASC
      `;

      const dataResult = await db.query(dataQuery, [baseDos, ...queryParams]);

      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('Error fetching pending actual dispatches', error);
      throw new Error('Failed to fetch pending actual dispatches');
    }
  }

  async getDispatchHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      const baseDoExp = `COALESCE(substring(lrc.so_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), lrc.so_no)`;

      let whereConditions = ['lrc.planned_1 IS NOT NULL', 'lrc.actual_1 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;

      if (filters.search) {
        whereConditions.push(`(lrc.so_no ILIKE $${paramIndex} OR lrc.party_name ILIKE $${paramIndex})`);
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`lrc.party_name = $${paramIndex}`);
        queryParams.push(filters.customer_name);
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

      // Step 1: Get paginated Base DOs
      const groupQuery = `
        SELECT ${baseDoExp} as base_do, MAX(lrc.actual_1) as sort_date
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
        GROUP BY base_do
        ORDER BY sort_date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const groupResult = await db.query(groupQuery, [...queryParams, limit, offset]);
      const baseDos = groupResult.rows.map(r => r.base_do);

      if (baseDos.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      // Step 2: Get total count of groups
      const countQuery = `
        SELECT COUNT(DISTINCT ${baseDoExp}) as total
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Step 3: Fetch all rows for these Base DOs
      let dataWhereConditions = [`${baseDoExp} = ANY($1)`];
      let dataParamIndex = 2;

      if (filters.search) {
        dataWhereConditions.push(`(lrc.so_no ILIKE $${dataParamIndex} OR lrc.party_name ILIKE $${dataParamIndex})`);
        dataParamIndex++;
      }
      if (filters.customer_name) {
        dataWhereConditions.push(`lrc.party_name = $${dataParamIndex}`);
        dataParamIndex++;
      }
      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        dataWhereConditions.push(`od.depo_name = ANY($${dataParamIndex})`);
        dataParamIndex++;
      }

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
          od.bill_company_name,
          od.depo_name
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE ${dataWhereConditions.join(' AND ')}
        AND lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NOT NULL
        ORDER BY lrc.actual_1 DESC, lrc.so_no ASC
      `;

      const dataResult = await db.query(dataQuery, [baseDos, ...queryParams]);

      return {
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };
    } catch (error) {
      Logger.error('Error fetching actual dispatch history', error);
      throw new Error('Failed to fetch actual dispatch history');
    }
  }

  async submitActualDispatch(dsrNumber, data = {}) {
    try {
      Logger.info(`Submitting actual dispatch for DSR: ${dsrNumber}`);
      Logger.debug(`[ACTUAL DISPATCH] Raw body data:`, { data });

      // Explicitly pick only the fields the user wants to submit
      // This avoids sending fields that don't exist in the table (like planned_2)
      const updateData = {
        actual_1: new Date().toISOString(),
        product_name_1: data.product_name_1 || null,
        actual_dispatch_user: data.username || null,
        actual_qty_dispatch: parseFloat(data.actual_qty_dispatch) || 0,
        check_status: data.check_status || null,
        remarks: data.remarks || null,
        fitness: data.fitness || null,
        insurance: data.insurance || null,
        tax_copy: data.tax_copy || null,
        polution: data.polution || null,
        permit1: data.permit1 || null,
        permit2_out_state: data.permit2_out_state || null,
        actual_qty: parseFloat(data.actual_qty) || 0,
        weightment_slip_copy: data.weightment_slip_copy || null,
        rst_no: data.rst_no || null,
        gross_weight: parseFloat(data.gross_weight) || 0,
        tare_weight: parseFloat(data.tare_weight) || 0,
        net_weight: parseFloat(data.net_weight) || 0,
        transporter_name: data.transporter_name || null,
        reason_of_difference_in_weight_if_any_speacefic: data.reason_of_difference_in_weight_if_any_speacefic || null,
        truck_no: data.truck_no || null,
        vehicle_no_plate_image: data.vehicle_no_plate_image || null,
        vehicle_number: data.vehicle_number || null,
        extra_weight: parseFloat(data.extra_weight) || 0,
        fitness_end_date: data.fitness_end_date || null,
        insurance_end_date: data.insurance_end_date || null,
        tax_end_date: data.tax_end_date || null,
        pollution_end_date: data.pollution_end_date || null,
        permit1_end_date: data.permit1_end_date || null,
        permit2_end_date: data.permit2_end_date || null,
        difference: parseFloat(data.difference) || 0,
        registration_no: data.registration_no || null,
        vehicle_type: data.vehicle_type || null,
        rto: data.rto || null,
        road_tax: data.road_tax || null,
        passing_weight: parseFloat(data.passing_weight) || 0,
        gvw: parseFloat(data.gvw) || 0,
        ulw: parseFloat(data.ulw) || 0,
        vehicle_overload_remarks: data.vehicle_overload_remarks || null,
        freight_rate_type: data.freight_rate_type || null,
        freight_amount: parseFloat(data.freight_amount) || 0,
        driver_name: data.driver_name || null,
        driver_contact_no: data.driver_contact_no || null,
        driving_license_no: data.driving_license_no || null,
        dl_valid_upto: data.dl_valid_upto || null,
        advance_bhada_bank: parseFloat(data.cash_bank) || 0,
        advance_bhada_diesel_advance: parseFloat(data.diesel_advance) || 0,
        advance_bhada_cash: parseFloat(data.bhada) || 0,
        security_guard_status: null,
        revert_security_remarks: null
      };

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Step 1: Get original dispatch info (planned quantity, SO number, and category)
        const currentQuery = `
          SELECT lrc.so_no, lrc.qty_to_be_dispatched, od.order_category, od.depo_name
          FROM lift_receiving_confirmation lrc
          LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
          WHERE lrc.d_sr_number = $1
        `;
        const currentResult = await client.query(currentQuery, [dsrNumber]);

        if (currentResult.rows.length === 0) {
          throw new Error('Dispatch record not found');
        }

        const originalDispatch = currentResult.rows[0];
        const plannedQty = parseFloat(originalDispatch.qty_to_be_dispatched || 0);
        const actualQty = parseFloat(data.actual_qty_dispatch || data.actual_qty || plannedQty);
        const diffQty = plannedQty - actualQty;
        const soNo = originalDispatch.so_no;
        const orderCategory = (originalDispatch.order_category || "").toUpperCase();
        const depotName = (originalDispatch.depo_name || "").toUpperCase();
        await this.ensurePlanned4TriggerUsesTat(client);
        updateData.planned_4 = await this.getPlannedTimestamp(client, 'Security Guard Approval');

        // SPECIAL RULE: Skip Security Guard Approval only if depot is NOT "BANARI"
        if (depotName !== "BANARI") {
          const now = new Date().toISOString();
          updateData.actual_4 = now;
        }

        // Step 2: Update lift_receiving_confirmation
        const fields = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

        const query = `
          UPDATE lift_receiving_confirmation 
          SET ${setClause}
          WHERE d_sr_number = $${fields.length + 1}
          RETURNING *
        `;

        const result = await client.query(query, [...values, dsrNumber]);

        // Step 3: Handle partial dispatch by updating order_dispatch
        if (diffQty !== 0 && soNo) {
          Logger.info(`[ACTUAL DISPATCH] Partial dispatch detected for SO: ${soNo}. Category: ${orderCategory}, Planned: ${plannedQty}, Actual: ${actualQty}, Difference: ${diffQty}`);

          // Get current remaining_dispatch_qty from order_dispatch
          const orderQuery = `SELECT remaining_dispatch_qty FROM order_dispatch WHERE order_no = $1`;
          const orderResult = await client.query(orderQuery, [soNo]);

          if (orderResult.rows.length > 0) {
            const currentOrder = orderResult.rows[0];
            const oldRemaining = parseFloat(currentOrder.remaining_dispatch_qty || 0);

            // SPECIAL RULE for Stock Transfer: Zero out the difference effectively "pre-closing" the order
            const isStockTransfer = orderCategory === 'STOCK TRANSFER';
            const newRemaining = isStockTransfer ? 0 : Math.max(0, oldRemaining + diffQty);

            Logger.info(`[ACTUAL DISPATCH] Updating order_dispatch. Category: ${orderCategory}, Old Remaining: ${oldRemaining}, New Remaining: ${newRemaining}`);

            // If newRemaining > 0, we must set actual_3 to NULL so it appears back in Dispatch Planning
            // For Stock Transfer, newRemaining will be 0, so actual_3 remains NOT NULL (Completed)
            let updateOrderQuery;
            let updateOrderParams;

            if (newRemaining > 0 && !isStockTransfer) {
              updateOrderQuery = `UPDATE order_dispatch SET remaining_dispatch_qty = $1, actual_3 = NULL WHERE order_no = $2`;
              updateOrderParams = [newRemaining, soNo];
            } else {
              updateOrderQuery = `UPDATE order_dispatch SET remaining_dispatch_qty = $1 WHERE order_no = $2`;
              updateOrderParams = [0, soNo];
            }

            await client.query(updateOrderQuery, updateOrderParams);
          }
        }

        await client.query('COMMIT');
        return { success: true, message: 'Actual dispatch submitted successfully', data: result.rows[0] };
      } catch (error) {
        await client.query('ROLLBACK');
        Logger.error('[ACTUAL DISPATCH] Transaction error:', error);
        throw new Error(`Database error: ${error.message} (Field check: ${Object.keys(updateData).join(', ')})`);
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error submitting actual dispatch', error);
      throw error;
    }
  }

  async getPlannedTimestamp(client, stageName) {
    const normalizeStageName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedStageName = normalizeStageName(stageName);
    const stageAliases = {
      securityguardapproval: ['securityguardapproval', 'securityapproval'],
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

  async ensurePlanned4TriggerUsesTat(client) {
    await client.query(`
      CREATE OR REPLACE FUNCTION set_planned_4_from_actual_1()
      RETURNS TRIGGER AS $$
      DECLARE
          security_guard_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO security_guard_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('securityguardapproval', 'securityapproval')
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_1 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_1 IS DISTINCT FROM NEW.actual_1) THEN
              NEW.planned_4 := NEW.actual_1::timestamptz + COALESCE(security_guard_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  /**
   * Revert actual dispatch
   * 1. Delete from lift_receiving_confirmation
   * 2. Restore quantity in order_dispatch
   * 3. Reset actual_3 status in order_dispatch
   * @param {string} dsrNumber - DSR Number
   * @param {string} username - User who is reverting
   * @returns {Promise<Object>} Status of reversion
   */
  async revertActualDispatch(dsrNumber, username, remarks) {
    try {
      Logger.info(`Reverting actual dispatch for DSR: ${dsrNumber} by user: ${username}`, { remarks });

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Step 1: Get dispatch info before deleting (join with order_dispatch to get order_type, product_name, rate_of_material)
        const infoQuery = `
          SELECT lrc.so_no, lrc.qty_to_be_dispatched, od.order_type, od.product_name, od.rate_of_material
          FROM lift_receiving_confirmation lrc
          LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
          WHERE lrc.d_sr_number = $1
        `;
        const infoResult = await client.query(infoQuery, [dsrNumber]);

        if (infoResult.rows.length === 0) {
          throw new Error('Dispatch record not found');
        }

        const { so_no: soNo, qty_to_be_dispatched: qtyToRevert, order_type: orderType, product_name: productName, rate_of_material: rateOfMaterial } = infoResult.rows[0];
        const revertAmt = parseFloat(qtyToRevert || 0);

        // Step 2: Delete from lift_receiving_confirmation
        await client.query(`DELETE FROM lift_receiving_confirmation WHERE d_sr_number = $1`, [dsrNumber]);

        // Step 3: Update order_dispatch to restore quantity, reset status, and save revert remarks
        if (soNo) {
          let updateOrderQuery;

          if (orderType && orderType.toLowerCase() === 'regular') {
            // For regular orders: set planned_1 to current date instead of leaving it
            updateOrderQuery = `
              UPDATE order_dispatch 
              SET 
                remaining_dispatch_qty = COALESCE(remaining_dispatch_qty, 0) + $1,
                planned_3 = NULL,
                actual_3 = NULL,
                planned_2 = NULL,
                actual_2 = NULL,
                actual_1 = NULL,
                planned_1 = NOW(),
                order_type = 'pre-approval',
                revert_dispatch_remarks = $3
              WHERE order_no = $2
            `;
          } else {
            // For non-regular orders: keep existing behavior (don't touch planned_1)
            updateOrderQuery = `
              UPDATE order_dispatch 
              SET 
                remaining_dispatch_qty = COALESCE(remaining_dispatch_qty, 0) + $1,
                planned_3 = NULL,
                actual_3 = NULL,
                planned_2 = NULL,
                actual_2 = NULL,
                actual_1 = NULL,
                revert_dispatch_remarks = $3
              WHERE order_no = $2
            `;
          }

          await client.query(updateOrderQuery, [revertAmt, soNo, remarks || null]);
          Logger.info(`[REVERT] Restored ${revertAmt} to SO: ${soNo} (order_type: ${orderType || 'unknown'}, remarks: ${remarks || 'none'})`);

          // Step 4: For regular orders, map oil_type and derive rates FOR THE ENTIRE GROUP
          if (orderType && orderType.toLowerCase() === 'regular' && productName) {
            try {
              // 1. Fetch all products in this DO group to consolidate rates
              // Use base DO (strip suffixes like A, B, /1) to catch sister rows like DO-698A, DO-698B
              const baseDo = soNo.replace(/[a-zA-Z/]+$/, '');
              const groupQuery = `SELECT id, product_name, rate_of_material FROM order_dispatch WHERE order_no LIKE $1`;
              const groupResult = await client.query(groupQuery, [`${baseDo}%`]);
              const groupProducts = groupResult.rows;

              // 2. Derive consolidated rates for the whole group (mapped by oil type)
              const consolidatedRatesMap = await deriveConsolidatedRatesForGroup(groupProducts);

              if (consolidatedRatesMap) {
                // 3. Update products in the group with their specific oil-type rates
                for (const p of groupProducts) {
                  const oilType = detectOilType(p.product_name);
                  const rates = consolidatedRatesMap[oilType];

                  if (rates) {
                    const updateRatesQuery = `
                      UPDATE order_dispatch 
                      SET rate_per_15kg = $1, rate_per_ltr = $2, oil_type = $3
                      WHERE id = $4
                    `;
                    await client.query(updateRatesQuery, [rates.rate_per_15kg, rates.rate_per_ltr, oilType, p.id]);
                  } else {
                    // Fallback to individual derivation if oil type not in map
                    const derivedRes = await deriveRatesForRegularOrder(p.product_name, parseFloat(p.rate_of_material));
                    if (derivedRes) {
                      await client.query(`UPDATE order_dispatch SET rate_per_15kg = $1, rate_per_ltr = $2, oil_type = $3 WHERE id = $4`,
                        [derivedRes.rate_per_15kg, derivedRes.rate_per_ltr, oilType, p.id]);
                    }
                  }
                }
                Logger.info(`[REVERT] Consolidated rates applied by oil type for group ${baseDo}% (reverted from Actual)`);
              }
            } catch (error) {
              Logger.warn(`[REVERT] Post-revert group updates failed for SO ${soNo}: ${error.message}`);
            }
          }
        }

        await client.query('COMMIT');
        return { success: true, message: 'Actual dispatch reverted successfully' };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error reverting actual dispatch', error);
      throw error;
    }
  }

  /**
   * Get dynamic filter options for Actual Dispatch stage
   * @returns {Promise<Object>} Unique party names
   */
  async getFilterOptions() {
    try {
      const query = `
        SELECT DISTINCT lrc.party_name
        FROM lift_receiving_confirmation lrc
        WHERE lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL
        ORDER BY lrc.party_name ASC
      `;
      const result = await db.query(query);
      return {
        success: true,
        data: {
          customerNames: result.rows.map(r => r.party_name).filter(Boolean)
        }
      };
    } catch (error) {
      Logger.error('Error fetching filter options for Actual Dispatch', error);
      throw new Error('Failed to fetch filter options');
    }
  }
}

module.exports = new ActualDispatchService();
