/**
 * Customer Details Service
 * Handles operations for customer_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class CustomerService {
  /**
   * Get all active customers
   */
  async getAllCustomers(params = {}) {
    try {
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];

      const conditions = ["approval_status = 'approved'"];
      if (!all) conditions.push("status = 'Active'");

      if (search) {
        const { buildSearchCondition } = require('../utils/searchUtils');
        const { clause, params: searchParams } = buildSearchCondition(['customer_name', 'customer_id', 'gstin', 'contact_person', 'contact', 'email'], search, values.length + 1);
        values.push(...searchParams);
        conditions.push(clause);
      }

      const whereClause = " WHERE " + conditions.join(" AND ");

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM customer_details ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      const query = `
        SELECT
          id, customer_id, customer_name, status, contact_person, contact,
          email, address_line_1, address_line_2, state, pincode,
          pan, gstin, gst_registered
        FROM customer_details
        ${whereClause}
        ORDER BY customer_name ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;

      values.push(limit, offset);
      const result = await pool.query(query, values);

      Logger.info(`Fetched ${result.rows.length} customers (total: ${total}, search: "${search}")`);
      return {
        customers: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching customers:', error);
      throw error;
    }
  }

  async getPendingCustomers() {
    try {
      const query = `
        SELECT
          cd.id, cd.customer_id, cd.customer_name, cd.status, cd.contact_person, cd.contact,
          cd.email, cd.address_line_1, cd.address_line_2, cd.state, cd.pincode,
          cd.pan, cd.gstin, cd.gst_registered, cd.rejection_reason, cd.created_at,
          l.username AS created_by_name
        FROM customer_details cd
        LEFT JOIN login l ON l.id = cd.created_by
        WHERE cd.approval_status = 'pending'
        ORDER BY cd.created_at ASC
      `;
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} pending customers`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching pending customers:', error);
      throw error;
    }
  }

  async reviewCustomer(id, action, reviewedBy, reason) {
    try {
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const query = `
        UPDATE customer_details
        SET
          approval_status = $1,
          reviewed_by = $2,
          rejection_reason = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND approval_status = 'pending'
        RETURNING *
      `;
      const result = await pool.query(query, [approvalStatus, reviewedBy, reason || null, id]);
      if (!result.rows.length) throw new Error(`Pending customer with ID ${id} not found`);
      Logger.info(`Customer ID ${id} ${approvalStatus} by user ${reviewedBy}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error reviewing customer ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId) {
    try {
      const query = `
        SELECT 
          id,
          customer_id,
          customer_name,
          status,
          contact_person,
          contact,
          email,
          address_line_1,
          address_line_2,
          state,
          pincode,
          pan,
          gstin,
          gst_registered
        FROM customer_details
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [customerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched customer details for ID: ${customerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Get customer by name
   */
  async getCustomerByName(customerName) {
    try {
      const query = `
        SELECT 
          id,
          customer_id,
          customer_name,
          status,
          contact_person,
          contact,
          email,
          address_line_1,
          address_line_2,
          state,
          pincode,
          pan,
          gstin,
          gst_registered
        FROM customer_details
        WHERE customer_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [customerName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched customer details for: ${customerName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching customer by name ${customerName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(data) {
    try {
      const {
        customer_id,
        customer_name,
        status = 'Active',
        contact_person,
        contact,
        email,
        address_line_1,
        address_line_2,
        state,
        pincode,
        pan,
        gstin,
        gst_registered,
        approval_status = 'approved',
        created_by = null
      } = data;

      const query = `
        INSERT INTO customer_details (
          customer_id, customer_name, status, contact_person, contact,
          email, address_line_1, address_line_2, state, pincode,
          pan, gstin, gst_registered, approval_status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;

      const values = [
        customer_id, customer_name, status, contact_person, contact,
        email, address_line_1, address_line_2, state, pincode,
        pan, gstin, gst_registered, approval_status, created_by
      ];

      const result = await pool.query(query, values);
      Logger.info(`Created new customer with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Update an existing customer
   */
  async updateCustomer(id, data) {
    try {
      const {
        customer_id,
        customer_name,
        status,
        contact_person,
        contact,
        email,
        address_line_1,
        address_line_2,
        state,
        pincode,
        pan,
        gstin,
        gst_registered
      } = data;

      const query = `
        UPDATE customer_details
        SET 
          customer_id = $1,
          customer_name = $2,
          status = $3,
          contact_person = $4,
          contact = $5,
          email = $6,
          address_line_1 = $7,
          address_line_2 = $8,
          state = $9,
          pincode = $10,
          pan = $11,
          gstin = $12,
          gst_registered = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
        RETURNING *
      `;

      const values = [
        customer_id, customer_name, status, contact_person, contact,
        email, address_line_1, address_line_2, state, pincode,
        pan, gstin, gst_registered, id
      ];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      Logger.info(`Updated customer ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating customer ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a customer (Soft delete by setting status to Inactive)
   */
  async deleteCustomer(id) {
    try {
      const query = `
        UPDATE customer_details
        SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      Logger.info(`Soft deleted customer ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting customer ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
