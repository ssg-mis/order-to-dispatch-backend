/**
 * Dispatch Planning Service
 * Business logic for dispatch planning management (Stage 4: Dispatch Planning)
 * Conditions:
 * - Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
 * - History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');
const { deriveRatesForRegularOrder, deriveConsolidatedRatesForGroup, detectOilType } = require('../utils/rateDerivation');

class DispatchPlanningService {
  /**
   * Get pending dispatch planning orders from order_dispatch table
   * Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
   * @param {Object} filters - Filteinr parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Pending orders
   */
  async getPendingDispatches(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      let whereConditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
      let queryParams = [];
      let paramIndex = 1;

      // Add optional filters
      if (filters.order_no) {
        whereConditions.push(`order_no = $${paramIndex}`);
        queryParams.push(filters.order_no);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`customer_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.customer_name}%`);
        paramIndex++;
      }

      if (filters.start_date && filters.end_date) {
        whereConditions.push(`delivery_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        queryParams.push(filters.start_date, filters.end_date);
        paramIndex += 2;
      }

      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        whereConditions.push(`depo_name = ANY($${paramIndex})`);
        queryParams.push(filters.depo_names);
        paramIndex++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Count total
      const countQuery = `SELECT COUNT(*) FROM order_dispatch ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get data
      const dataQuery = `
        SELECT *
        FROM order_dispatch 
        ${whereClause}
        ORDER BY created_at DESC, order_no ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

      Logger.info(`Fetched ${dataResult.rows.length} pending dispatch planning orders`);

      return {
        success: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching pending dispatches', error);
      throw new Error('Failed to fetch pending dispatches');
    }
  }

  /**
   * Get dispatch planning history
   * History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} History orders
   */
  async getDispatchHistory(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 10;
      const offset = (page - 1) * limit;

      let whereConditions = ['planned_3 IS NOT NULL', 'actual_3 IS NOT NULL'];
      let queryParams = [];
      let paramIndex = 1;

      // Add optional filters
      if (filters.order_no) {
        whereConditions.push(`order_no = $${paramIndex}`);
        queryParams.push(filters.order_no);
        paramIndex++;
      }

      if (filters.customer_name) {
        whereConditions.push(`customer_name ILIKE $${paramIndex}`);
        queryParams.push(`%${filters.customer_name}%`);
        paramIndex++;
      }

      if (filters.start_date && filters.end_date) {
        whereConditions.push(`delivery_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        queryParams.push(filters.start_date, filters.end_date);
        paramIndex += 2;
      }

      if (filters.depo_names && Array.isArray(filters.depo_names)) {
        whereConditions.push(`depo_name = ANY($${paramIndex})`);
        queryParams.push(filters.depo_names);
        paramIndex++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Count total
      const countQuery = `SELECT COUNT(*) FROM order_dispatch ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get data
      const dataQuery = `
        SELECT *
        FROM order_dispatch 
        ${whereClause}
        ORDER BY created_at DESC, order_no ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);

      Logger.info(`Fetched ${dataResult.rows.length} dispatch history records`);

      return {
        success: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching dispatch history', error);
      throw new Error('Failed to fetch dispatch history');
    }
  }

  /**
   * Submit dispatch planning
   * 1. Insert into lift_receiving_confirmation table
   * 2. Update actual_3 in order_dispatch table
   * @param {number} orderId - Order ID from order_dispatch table
   * @param {Object} data - Dispatch data
   * @returns {Promise<Object>} Created dispatch record
   */
  async submitDispatchPlanning(orderId, data = {}) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      Logger.info(`Submitting dispatch planning for order ID: ${orderId}`, { data });

      // First, get the order details from order_dispatch
      const orderQuery = `
        SELECT 
          order_no, customer_name, product_name, 
          order_quantity, type_of_transporting,
          approval_qty, remaining_dispatch_qty, processid
        FROM order_dispatch 
        WHERE id = $1
      `;
      const orderResult = await client.query(orderQuery, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // Calculate remaining quantity logic
      // If remaining_dispatch_qty is null, use approval_qty (or order_quantity if approval_qty is missing)
      const currentAvailable = order.remaining_dispatch_qty !== null
        ? parseFloat(order.remaining_dispatch_qty)
        : parseFloat(order.approval_qty || order.order_quantity || 0);

      const dispatchQty = parseFloat(data.dispatch_qty || order.order_quantity || 0);

      // New remaining quantity
      const newRemainingQty = currentAvailable - dispatchQty;

      Logger.info(`Partial dispatch calc: Order ${order.order_no} - Available: ${currentAvailable}, Dispatched: ${dispatchQty}, New Rem: ${newRemainingQty}`);

      // Generate DSR number (dispatch serial number) using atomic sequence
      // Format: DSR-001, DSR-002, etc.
      const seqQuery = "SELECT nextval('dsr_number_seq') as val";
      const seqResult = await client.query(seqQuery);
      const dsrCount = seqResult.rows[0].val;
      const dsrNumber = `DSR-${String(dsrCount).padStart(3, '0')}`;

      // Insert into lift_receiving_confirmation
      const insertQuery = `
        INSERT INTO lift_receiving_confirmation (
          timestamp, d_sr_number, so_no, party_name, 
          product_name, qty_to_be_dispatched, 
          type_of_transporting, dispatch_from, processid
        ) VALUES (
          NOW(), $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING *
      `;

      const insertParams = [
        dsrNumber,
        order.order_no,
        order.customer_name,
        order.product_name,
        dispatchQty,
        order.type_of_transporting,
        data.dispatch_from || null,
        order.processid || null
      ];

      const insertResult = await client.query(insertQuery, insertParams);

      // Update order_dispatch
      // 1. Update remaining_dispatch_qty
      // 2. Update actual_3 IF newRemainingQty <= 0 (Completed)
      let updateQuery;
      let updateParams;

      Logger.info(`[DEBUG-TRACKING] Raw data received in submitDispatchPlanning:`, { data });

      if (newRemainingQty <= 0) {
        // Full Dispatch or Over Dispatch -> Mark as Completed (actual_3 = NOW())
        updateQuery = `
          UPDATE order_dispatch 
          SET 
            remaining_dispatch_qty = $1, 
            actual_3 = NOW(), 
            dispatch_planning_user = $3,
            transfer = $4,
            bill_company_name = $5,
            bill_address = $6,
            ship_company_name = $7,
            ship_address = $8,
            freight_rate = $9
          WHERE id = $2
          RETURNING *
        `;
        updateParams = [
          0,
          orderId,
          data.username || null,
          data.transfer || 'no',
          data.bill_company_name || null,
          data.bill_address || null,
          data.ship_company_name || null,
          data.ship_address || null,
          data.freight_rate || 0
        ]; // Cap at 0
      } else {
        // Partial Dispatch -> Keep Pending (actual_3 stays NULL)
        updateQuery = `
          UPDATE order_dispatch 
          SET 
            remaining_dispatch_qty = $1, 
            dispatch_planning_user = $3,
            transfer = $4,
            bill_company_name = $5,
            bill_address = $6,
            ship_company_name = $7,
            ship_address = $8,
            freight_rate = $9
          WHERE id = $2
          RETURNING *
        `;
        updateParams = [
          newRemainingQty,
          orderId,
          data.username || null,
          data.transfer || 'no',
          data.bill_company_name || null,
          data.bill_address || null,
          data.ship_company_name || null,
          data.ship_address || null,
          data.freight_rate || 0
        ];
      }

      Logger.info(`[DEBUG-TRACKING] Prepared updateParams for order_dispatch (Planning):`, {
        dispatch_planning_user: updateParams[2]
      });

      await client.query(updateQuery, updateParams);

      await client.query('COMMIT');

      Logger.info(`Dispatch planning submitted successfully for order ID: ${orderId}`, {
        dsrNumber,
        orderNo: order.order_no
      });

      return {
        success: true,
        message: 'Dispatch planning submitted successfully',
        data: {
          dispatchRecord: insertResult.rows[0],
          dsrNumber,
          orderNo: order.order_no
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error submitting dispatch planning', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revert dispatch planning back to pre-approval
   * 1. Null actual_3, planned_3, actual_2, planned_2, actual_1 in order_dispatch
   * 2. Keep remaining_dispatch_qty as-is (do NOT restore to approval_qty)
   * 3. Do NOT delete lift_receiving_confirmation records (only actual dispatch revert should do that)
   * @param {number} orderId - Order ID from order_dispatch table
   * @param {string} username - User who is reverting
   * @returns {Promise<Object>} Status of reversion
   */
  async revertDispatchPlanning(orderId, username, remarks) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      Logger.info(`[DISPATCH PLANNING] Reverting order ID: ${orderId} by user: ${username}`, { remarks });

      // Step 1: Get order details
      const orderQuery = `SELECT order_no, approval_qty, order_quantity, remaining_dispatch_qty, order_type, product_name, rate_of_material FROM order_dispatch WHERE id = $1`;
      const orderResult = await client.query(orderQuery, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];
      // Keep the current remaining_dispatch_qty (e.g. 20) — do NOT reset to approval_qty (50).
      // If remaining_dispatch_qty is NULL (never partially dispatched), fall back to approval_qty.
      const qtyToRestore = order.remaining_dispatch_qty !== null
        ? parseFloat(order.remaining_dispatch_qty)
        : parseFloat(order.approval_qty || order.order_quantity || 0);

      // Step 2 (SKIPPED): Do NOT delete lift_receiving_confirmation records here.
      // Those records were created by actual dispatch (actualDispatchService) and should
      // only be removed when actual dispatch is reverted, not dispatch planning.
      Logger.info(`[REVERT] Dispatch planning revert — keeping lift_receiving_confirmation records intact for SO: ${order.order_no}`);

      // Step 3: Update order_dispatch - null all stage columns, restore qty, and save remarks
      let updateQuery;

      if (order.order_type && order.order_type.toLowerCase() === 'regular') {
        // For regular orders: set planned_1 to current date
        updateQuery = `
          UPDATE order_dispatch 
          SET 
            actual_3 = NULL,
            planned_3 = NULL,
            actual_2 = NULL,
            planned_2 = NULL,
            actual_1 = NULL,
            planned_1 = NOW(),
            order_type = 'pre-approval',
            remaining_dispatch_qty = $1,
            revert_planning_remarks = $3
          WHERE id = $2
          RETURNING *
        `;
      } else {
        // For non-regular orders: keep existing behavior (don't touch planned_1)
        updateQuery = `
          UPDATE order_dispatch 
          SET 
            actual_3 = NULL,
            planned_3 = NULL,
            actual_2 = NULL,
            planned_2 = NULL,
            actual_1 = NULL,
            remaining_dispatch_qty = $1,
            revert_planning_remarks = $3
          WHERE id = $2
          RETURNING *
        `;
      }

      await client.query(updateQuery, [qtyToRestore, orderId, remarks || null]);
      Logger.info(`[REVERT] Reset order ID: ${orderId} back to pre-approval. Kept remaining_dispatch_qty: ${qtyToRestore} (order_type: ${order.order_type || 'unknown'}, remarks: ${remarks || 'none'})`);

      // Step 4: For regular orders, map oil_type and derive rates FOR THE ENTIRE GROUP
      if (order.order_type && order.order_type.toLowerCase() === 'regular' && order.product_name) {
        try {
          // 1. Fetch all products in this DO group to consolidate rates
          // Use base DO (strip suffixes like A, B, /1) to catch sister rows like DO-698A, DO-698B
          const baseDo = order.order_no.replace(/[a-zA-Z/]+$/, '');
          const groupQuery = `SELECT id, product_name, rate_of_material FROM order_dispatch WHERE order_no LIKE $1`;
          const groupResult = await client.query(groupQuery, [`${baseDo}%`]);
          const groupProducts = groupResult.rows;

          // 2. Derive consolidated rates for the whole group
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
                // Individual derivation fallback if oil type not in consolidation map for some reason
                const derivedRes = await deriveRatesForRegularOrder(p.product_name, parseFloat(p.rate_of_material));
                if (derivedRes) {
                  await client.query(`UPDATE order_dispatch SET rate_per_15kg = $1, rate_per_ltr = $2, oil_type = $3 WHERE id = $4`,
                    [derivedRes.rate_per_15kg, derivedRes.rate_per_ltr, oilType, p.id]);
                }
              }
            }
            Logger.info(`[REVERT] Consolidated rates applied by oil type for group ${baseDo}%`);
          }
        } catch (error) {
          Logger.warn(`[REVERT] Post-revert group updates failed for order NO ${order.order_no}: ${error.message}`);
        }
      }

      await client.query('COMMIT');
      return { success: true, message: 'Dispatch planning reverted to pre-approval successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error reverting dispatch planning', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update transfer details for an order
   * @param {number} orderId - Order ID from order_dispatch table
   * @param {Object} data - Transfer data
   * @returns {Promise<Object>} Status of update
   */
  async updateTransferDetails(orderId, data = {}) {
    try {
      const updateQuery = `
        UPDATE order_dispatch 
        SET 
          transfer = $1,
          bill_company_name = $2,
          bill_address = $3,
          ship_company_name = $4,
          ship_address = $5,
          freight_rate = $6
        WHERE id = $7
        RETURNING *
      `;

      const updateParams = [
        data.transfer || 'yes',
        data.bill_company_name || null,
        data.bill_address || null,
        data.ship_company_name || null,
        data.ship_address || null,
        data.freight_rate || 0,
        orderId
      ];

      const result = await db.query(updateQuery, updateParams);

      if (result.rows.length === 0) {
        throw new Error('Order not found');
      }

      Logger.info(`Updated transfer details for order ID: ${orderId}`);

      return {
        success: true,
        message: 'Transfer details updated successfully',
        data: result.rows[0]
      };
    } catch (error) {
      Logger.error(`Error updating transfer details for order ID: ${orderId}`, error);
      throw error;
    }
  }
}

module.exports = new DispatchPlanningService();

