/**
 * Salesperson Details Service
 * Handles operations for salesperson_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class SalespersonService {
  /**
   * Get all active salespersons
   */
  // v2 schema: delegate to the shared master-lookup helper.
  async getAllSalespersons(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { schema } = require('../config/db-v2.ts');
      const { rows, total } = await masterLookup(schema.salespersons, {
        nameColumn: 'salespersonName',
        searchColumns: ['salespersonName', 'salespersonCode', 'mobileNo', 'emailId'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} salespersons (total: ${total})`);
      return { salespersons: rows, pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total } };
    } catch (error) {
      Logger.error('Error fetching salespersons:', error);
      throw error;
    }
  }

  /**
   * Get salesperson by ID
   */
  async getSalespersonById(brokerId) {
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
        FROM salesperson_details
        WHERE broker_id = $1
      `;
      
      const result = await pool.query(query, [brokerId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched salesperson details for ID: ${brokerId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching salesperson ${brokerId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new salesperson
   */
  async getPendingSalespersons() {
    try {
      const result = await pool.query(`
        SELECT sd.broker_id, sd.salesman_name, sd.status, sd.email_id, sd.mobile_no,
               sd.depot_name, sd.depot_id, sd.rejection_reason, sd.created_at,
               sd.pending_changes, sd.pending_edit_at,
               CASE WHEN sd.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
               l.username  AS created_by_name,
               le.username AS pending_edit_by_name
        FROM salesperson_details sd
        LEFT JOIN login l  ON l.id  = sd.created_by
        LEFT JOIN login le ON le.id = sd.pending_edit_by
        WHERE sd.approval_status = 'pending' OR sd.pending_changes IS NOT NULL
        ORDER BY COALESCE(sd.pending_edit_at, sd.created_at) ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending salespersons:', error); throw error; }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (broker_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return ['salesman_name','mobile_no','email_id','depot_name','status'];
  }

  async reviewSalesperson(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = SalespersonService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM salesperson_details WHERE broker_id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Salesperson ${id} not found`);
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
            `UPDATE salesperson_details SET ${setCols} WHERE broker_id=$${n} RETURNING *`,
            params
          );
          Logger.info(`Salesperson ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE salesperson_details
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2
           WHERE broker_id=$3 RETURNING *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Salesperson ${id} edit rejected by user ${reviewedBy}`);
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
        `UPDATE salesperson_details SET ${setCols} WHERE broker_id=$${n} AND approval_status='pending' RETURNING *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending salesperson ${id} not found`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing salesperson ${id}:`, error); throw error; }
  }

  async createSalesperson(data) {
    try {
      const {
        broker_id, salesman_name, status = 'Active', email_id, mobile_no, depot_name, depot_id,
        approval_status = 'approved', created_by = null
      } = data;

      const query = `
        INSERT INTO salesperson_details (broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `;

      const values = [broker_id, salesman_name, status, email_id, mobile_no, depot_name, depot_id, approval_status, created_by];

      const result = await pool.query(query, values);
      Logger.info(`Created new salesperson with ID: ${result.rows[0].broker_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating salesperson:', error);
      throw error;
    }
  }

  /**
   * Update an existing salesperson.
   *
   * @param {number} id
   * @param {object} data  - the edited field values
   * @param {object} [opts]
   * @param {boolean} [opts.isAdmin=true] - admin/super_admin write directly; others are staged for approval
   * @param {number}  [opts.userId=null]  - who is making the edit (recorded on staged edits)
   * @returns {Promise<object>} the row, with `staged: true` when the change awaits approval
   */
  async updateSalesperson(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = SalespersonService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE salesperson_details
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW()
           WHERE broker_id = $3 AND approval_status = 'approved'
           RETURNING *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved salesperson with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Salesperson ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging salesperson edit ${id}:`, error);
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
        UPDATE salesperson_details
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
        throw new Error(`Salesperson with ID ${id} not found`);
      }

      Logger.info(`Updated salesperson ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating salesperson ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a salesperson
   */
  async deleteSalesperson(id) {
    try {
      const query = `
        DELETE FROM salesperson_details
        WHERE broker_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Salesperson with ID ${id} not found`);
      }

      Logger.info(`Deleted salesperson ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting salesperson ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new SalespersonService();
