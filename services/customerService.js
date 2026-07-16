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
  // v2 schema: delegate to the shared master-lookup helper (search columns are
  // drizzle camelCase keys). Returns snake_case rows + a real `id` FK.
  async getAllCustomers(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { schema } = require('../config/db-v2.ts');
      const { rows, total } = await masterLookup(schema.customers, {
        nameColumn: 'customerName',
        searchColumns: ['customerName', 'customerCode', 'gstin', 'contactPerson', 'contact', 'email'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} customers (total: ${total})`);
      return { customers: rows, pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total } };
    } catch (error) {
      Logger.error('Error fetching customers:', error);
      throw error;
    }
  }

  async getPendingCustomers() {
    try {
      // Two kinds of pending records share this list:
      //  - 'create': a brand-new customer awaiting approval (approval_status = 'pending')
      //  - 'edit'  : an approved customer with a staged change in pending_changes
      const query = `
        SELECT
          cd.id, cd.customer_id, cd.customer_name, cd.status, cd.contact_person, cd.contact,
          cd.email, cd.address_line_1, cd.address_line_2, cd.state, cd.pincode,
          cd.pan, cd.gstin, cd.gst_registered, cd.rejection_reason, cd.created_at,
          cd.pending_changes, cd.pending_edit_at,
          CASE WHEN cd.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
          l.username  AS created_by_name,
          le.username AS pending_edit_by_name
        FROM customer_details cd
        LEFT JOIN login l  ON l.id  = cd.created_by
        LEFT JOIN login le ON le.id = cd.pending_edit_by
        WHERE cd.approval_status = 'pending' OR cd.pending_changes IS NOT NULL
        ORDER BY COALESCE(cd.pending_edit_at, cd.created_at) ASC
      `;
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} pending customers (creates + edits)`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching pending customers:', error);
      throw error;
    }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (customer_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return ['customer_name','contact_person','contact','email','address_line_1','address_line_2','state','pincode','pan','gstin','gst_registered','status'];
  }

  async reviewCustomer(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = CustomerService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM customer_details WHERE id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Customer with ID ${id} not found`);
      let pendingChanges = existing.rows[0].pending_changes;
      if (typeof pendingChanges === 'string') {
        try { pendingChanges = JSON.parse(pendingChanges); } catch { pendingChanges = null; }
      }
      const isEdit = pendingChanges != null && existing.rows[0].approval_status === 'approved';

      // ----- Staged EDIT of an already-approved record -----
      if (isEdit) {
        if (action === 'approve') {
          // Proposed values, with any admin tweaks from the review modal layered on top.
          const safeOverrides = Object.fromEntries(Object.entries(overrides).filter(([k]) => ALLOWED.includes(k)));
          const merged = { ...pendingChanges, ...safeOverrides };
          const safe = Object.fromEntries(Object.entries(merged).filter(([k]) => ALLOWED.includes(k)));

          const params = [reviewedBy];
          let setCols = 'reviewed_by=$1, pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL, rejection_reason=NULL, updated_at=CURRENT_TIMESTAMP';
          let n = 2;
          for (const [col, val] of Object.entries(safe)) { setCols += `, ${col}=$${n++}`; params.push(val); }
          params.push(id);
          const result = await pool.query(
            `UPDATE customer_details SET ${setCols} WHERE id=$${n} RETURNING *`,
            params
          );
          Logger.info(`Customer ID ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE customer_details
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2, updated_at=CURRENT_TIMESTAMP
           WHERE id=$3 RETURNING *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Customer ID ${id} edit rejected by user ${reviewedBy}`);
        return result.rows[0];
      }

      // ----- Brand-new CREATE awaiting approval (original behavior) -----
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const safe = action === 'approve'
        ? Object.fromEntries(Object.entries(overrides).filter(([k]) => ALLOWED.includes(k)))
        : {};
      const params = [approvalStatus, reviewedBy, reason || null];
      let setCols = 'approval_status=$1, reviewed_by=$2, rejection_reason=$3, updated_at=CURRENT_TIMESTAMP';
      let n = 4;
      for (const [col, val] of Object.entries(safe)) { setCols += `, ${col}=$${n++}`; params.push(val); }
      params.push(id);
      const result = await pool.query(
        `UPDATE customer_details SET ${setCols} WHERE id=$${n} AND approval_status='pending' RETURNING *`,
        params
      );
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
   * Update an existing customer.
   *
   * @param {number} id
   * @param {object} data  - the edited field values
   * @param {object} [opts]
   * @param {boolean} [opts.isAdmin=true] - admin/super_admin write directly; others are staged for approval
   * @param {number}  [opts.userId=null]  - who is making the edit (recorded on staged edits)
   * @returns {Promise<object>} the row, with `staged: true` when the change awaits approval
   */
  async updateCustomer(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = CustomerService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE customer_details
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW(), updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND approval_status = 'approved'
           RETURNING *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved customer with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Customer ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging customer edit ${id}:`, error);
        throw error;
      }
    }

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
        DELETE FROM customer_details
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Customer with ID ${id} not found`);
      }

      Logger.info(`Deleted customer ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting customer ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
