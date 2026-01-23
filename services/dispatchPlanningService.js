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
      const dataQuery = `
        SELECT 
          id, order_no, customer_name, product_name, 
          order_quantity, type_of_transporting, delivery_date,
          planned_3, actual_3, created_at
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
        SELECT 
          id, order_no, customer_name, product_name, 
          order_quantity, type_of_transporting, delivery_date,
          planned_3, actual_3, created_at
        FROM order_dispatch 
        ${whereClause}
        ORDER BY actual_3 DESC, order_no ASC
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
          order_quantity, type_of_transporting
        FROM order_dispatch 
        WHERE id = $1
      `;
      const orderResult = await client.query(orderQuery, [orderId]);
      
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }
      
      const order = orderResult.rows[0];
      
      // Generate DSR number (dispatch serial number)
      // Format: DSR-001, DSR-002, etc.
      const dsrQuery = `
        SELECT COUNT(*) as count FROM lift_receiving_confirmation
      `;
      const dsrResult = await client.query(dsrQuery);
      const dsrCount = parseInt(dsrResult.rows[0].count) + 1;
      const dsrNumber = `DSR-${String(dsrCount).padStart(3, '0')}`;
      
      // Insert into lift_receiving_confirmation
      const insertQuery = `
        INSERT INTO lift_receiving_confirmation (
          timestamp, d_sr_number, so_no, party_name, 
          product_name, qty_to_be_dispatched, 
          type_of_transporting, dispatch_from
        ) VALUES (
          NOW(), $1, $2, $3, $4, $5, $6, $7
        ) RETURNING *
      `;
      
      const insertParams = [
        dsrNumber,
        order.order_no,
        order.customer_name,
        order.product_name,
        order.order_quantity,
        order.type_of_transporting,
        data.dispatch_from || null
      ];
      
      const insertResult = await client.query(insertQuery, insertParams);
      
      // Update actual_3 in order_dispatch
      const updateQuery = `
        UPDATE order_dispatch 
        SET actual_3 = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      await client.query(updateQuery, [orderId]);
      
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
