/**
 * Dispatch Planning Service
 * Business logic for dispatch planning management (Stage 4: Dispatch Planning)
 * Conditions:
 * - Pending: planned_3 IS NOT NULL AND actual_3 IS NULL
 * - History: planned_3 IS NOT NULL AND actual_3 IS NOT NULL
 */

const db = require('../config/db');
const { Logger } = require('../utils');

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
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Count total
      const countQuery = `SELECT COUNT(*) FROM order_dispatch ${whereClause}`;
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Get data
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
          SET remaining_dispatch_qty = $1, actual_3 = NOW(), dispatch_planning_user = $3
          WHERE id = $2
          RETURNING *
        `;
        updateParams = [0, orderId, data.username || null]; // Cap at 0
      } else {
         // Partial Dispatch -> Keep Pending (actual_3 stays NULL)
         updateQuery = `
          UPDATE order_dispatch 
          SET remaining_dispatch_qty = $1, dispatch_planning_user = $3
          WHERE id = $2
          RETURNING *
        `;
        updateParams = [newRemainingQty, orderId, data.username || null];
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
}

module.exports = new DispatchPlanningService();
