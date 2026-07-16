/**
 * Broker Details Service
 * Handles operations for broker_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class BrokerService {
  /**
   * Get all active brokers
   */
  // v2 schema: delegate to the shared master-lookup helper.
  async getAllBrokers(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { schema } = require('../config/db-v2.ts');
      const { rows, total } = await masterLookup(schema.brokers, {
        nameColumn: 'brokerName',
        searchColumns: ['brokerName', 'brokerCode', 'mobileNo', 'emailId'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} brokers (total: ${total})`);
      return { brokers: rows, pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total } };
    } catch (error) {
      Logger.error('Error fetching brokers:', error);
      throw error;
    }
  }

  /**
   * Get broker by ID
   */
  async getBrokerById(brokerId) {
    try {
      const query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
        WHERE broker_id = $1
      `;
      
      const result = await pool.query(query, [brokerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched broker details for ID: ${brokerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching broker ${brokerId}:`, error);
      throw error;
    }
  }

  /**
   * Get broker by salesman name
   */
  async getBrokerByName(salesmanName) {
    try {
      const query = `
        SELECT 
          broker_id,
          salesman_name,
          status,
          email_id,
          mobile_no,
          depot_name,
          depot_id
        FROM broker_details
        WHERE salesman_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [salesmanName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched broker details for: ${salesmanName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching broker by name ${salesmanName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new broker
   */
  async getPendingBrokers() {
    try {
      // Two kinds of pending records share this list:
      //  - 'create': a brand-new broker awaiting approval (approval_status = 'pending')
      //  - 'edit'  : an approved broker with a staged change in pending_changes
      const result = await pool.query(`
        SELECT bd.broker_id, bd.salesman_name, bd.status, bd.email_id, bd.mobile_no,
               bd.depot_name, bd.depot_id, bd.rejection_reason, bd.created_at,
               bd.pending_changes, bd.pending_edit_at,
               CASE WHEN bd.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
               l.username  AS created_by_name,
               le.username AS pending_edit_by_name
        FROM broker_details bd
        LEFT JOIN login l  ON l.id  = bd.created_by
        LEFT JOIN login le ON le.id = bd.pending_edit_by
        WHERE bd.approval_status = 'pending' OR bd.pending_changes IS NOT NULL
        ORDER BY COALESCE(bd.pending_edit_at, bd.created_at) ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending brokers:', error); throw error; }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (broker_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return ['salesman_name','mobile_no','email_id','depot_name','status'];
  }

  async reviewBroker(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = BrokerService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM broker_details WHERE broker_id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Broker ${id} not found`);
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
          let setCols = 'reviewed_by=$1, pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL, rejection_reason=NULL';
          let n = 2;
          for (const [col, val] of Object.entries(safe)) { setCols += `, ${col}=$${n++}`; params.push(val); }
          params.push(id);
          const result = await pool.query(
            `UPDATE broker_details SET ${setCols} WHERE broker_id=$${n} RETURNING *`,
            params
          );
          Logger.info(`Broker ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE broker_details
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2
           WHERE broker_id=$3 RETURNING *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Broker ${id} edit rejected by user ${reviewedBy}`);
        return result.rows[0];
      }

      // ----- Brand-new CREATE awaiting approval (original behavior) -----
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const safe = action === 'approve'
        ? Object.fromEntries(Object.entries(overrides).filter(([k]) => ALLOWED.includes(k)))
        : {};
      const params = [approvalStatus, reviewedBy, reason || null];
      let setCols = 'approval_status=$1, reviewed_by=$2, rejection_reason=$3';
      let n = 4;
      for (const [col, val] of Object.entries(safe)) { setCols += `, ${col}=$${n++}`; params.push(val); }
      params.push(id);
      const result = await pool.query(
        `UPDATE broker_details SET ${setCols} WHERE broker_id=$${n} AND approval_status='pending' RETURNING *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending broker ${id} not found`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing broker ${id}:`, error); throw error; }
  }

  async createBroker(data) {
    try {
      const {
        broker_id, salesman_name, status = 'Active', email_id, mobile_no, depot_name, depot_id,
        approval_status = 'approved', created_by = null
      } = data;

      const query = `
        INSERT INTO broker_details (broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `;

      const values = [broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by];

      const result = await pool.query(query, values);
      Logger.info(`Created new broker with ID: ${result.rows[0].broker_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating broker:', error);
      throw error;
    }
  }

  /**
   * Update an existing broker.
   *
   * @param {number|string} id
   * @param {object} data  - the edited field values
   * @param {object} [opts]
   * @param {boolean} [opts.isAdmin=true] - admin/super_admin write directly; others are staged for approval
   * @param {number}  [opts.userId=null]  - who is making the edit (recorded on staged edits)
   * @returns {Promise<object>} the row, with `staged: true` when the change awaits approval
   */
  async updateBroker(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = BrokerService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE broker_details
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW()
           WHERE broker_id = $3 AND approval_status = 'approved'
           RETURNING *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved broker with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Broker ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging broker edit ${id}:`, error);
        throw error;
      }
    }

    try {
      const {
        salesman_name,
        status,
        email_id,
        mobile_no,
        depot_name,
        depot_id
      } = data;

      const query = `
        UPDATE broker_details
        SET 
          salesman_name = $1,
          status = $2,
          email_id = $3,
          mobile_no = $4,
          depot_name = $5,
          depot_id = $6
        WHERE broker_id = $7
        RETURNING *
      `;

      const values = [salesman_name, status, email_id, mobile_no, depot_name, depot_id, id];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Broker with ID ${id} not found`);
      }

      Logger.info(`Updated broker ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating broker ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a broker
   */
  async deleteBroker(id) {
    try {
      const query = `
        DELETE FROM broker_details
        WHERE broker_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Broker with ID ${id} not found`);
      }

      Logger.info(`Deleted broker ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting broker ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new BrokerService();
