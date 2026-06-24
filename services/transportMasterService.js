/**
 * Transport Master Service
 * Handles operations for transport_master table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class TransportMasterService {
  /**
   * Get all transporters
   */
  async getAllTransporters(params = {}) {
    try {
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];

      const conditions = ["approval_status = 'approved'"];
      if (!all) conditions.push("status = 'Active'");
      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(transporter_name ILIKE $${values.length} OR transport_master_id ILIKE $${values.length} OR contact_person ILIKE $${values.length} OR contact_number ILIKE $${values.length})`);
      }
      const whereClause = " WHERE " + conditions.join(" AND ");

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM transport_master ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      let query = `
        SELECT
          transporter_id as id, transport_master_id, status, transporter_name, contact_person,
          contact_number, email_id, address_line1, state, pincode, pan, gstin, created_at,
          (pending_changes IS NOT NULL) AS has_pending_edit
        FROM transport_master
        ${whereClause}
        ORDER BY transporter_name ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      
      values.push(limit, offset);
      const result = await pool.query(query, values);
      
      Logger.info(`Fetched ${result.rows.length} transporters (total: ${total}, search: "${search}")`);
      return {
        transporters: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching transporters:', error);
      throw error;
    }
  }

  /**
   * Get transporter by ID
   */
  async getTransporterById(id) {
    try {
      const query = `
        SELECT 
          transporter_id as id, transport_master_id, status, transporter_name, contact_person, 
          contact_number, email_id, address_line1, state, pincode, pan, gstin, created_at
        FROM transport_master
        WHERE transporter_id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching transporter ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new transporter
   */
  async getPendingTransporters() {
    try {
      // Two kinds of pending records share this list:
      //  - 'create': a brand-new transporter awaiting approval (approval_status = 'pending')
      //  - 'edit'  : an approved transporter with a staged change in pending_changes
      const result = await pool.query(`
        SELECT tm.transporter_id as id, tm.transport_master_id, tm.transporter_name, tm.contact_person,
               tm.contact_number, tm.email_id, tm.address_line1, tm.state, tm.pincode, tm.pan,
               tm.gstin, tm.status, tm.rejection_reason, tm.created_at,
               tm.pending_changes, tm.pending_edit_at,
               CASE WHEN tm.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
               l.username  AS created_by_name,
               le.username AS pending_edit_by_name
        FROM transport_master tm
        LEFT JOIN login l  ON l.id  = tm.created_by
        LEFT JOIN login le ON le.id = tm.pending_edit_by
        WHERE tm.approval_status = 'pending' OR tm.pending_changes IS NOT NULL
        ORDER BY COALESCE(tm.pending_edit_at, tm.created_at) ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending transporters:', error); throw error; }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (transport_master_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return ['transporter_name','contact_person','contact_number','gstin','status'];
  }

  async reviewTransporter(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = TransportMasterService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM transport_master WHERE transporter_id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Transporter ${id} not found`);
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
            `UPDATE transport_master SET ${setCols} WHERE transporter_id=$${n} RETURNING transporter_id as id, *`,
            params
          );
          Logger.info(`Transporter ID ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE transport_master
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2
           WHERE transporter_id=$3 RETURNING transporter_id as id, *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Transporter ID ${id} edit rejected by user ${reviewedBy}`);
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
        `UPDATE transport_master SET ${setCols} WHERE transporter_id=$${n} AND approval_status='pending' RETURNING transporter_id as id, *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending transporter ${id} not found`);
      Logger.info(`Transporter ID ${id} ${approvalStatus} by user ${reviewedBy}`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing transporter ${id}:`, error); throw error; }
  }

  async createTransporter(data) {
    try {
      const {
        transport_master_id,
        status = 'Active',
        transporter_name,
        contact_person,
        contact_number,
        email_id,
        address_line1,
        state,
        pincode,
        pan,
        gstin,
        approval_status = 'approved',
        created_by = null
      } = data;

      const query = `
        INSERT INTO transport_master (
          transport_master_id, status, transporter_name, contact_person, contact_number,
          email_id, address_line1, state, pincode, pan, gstin, approval_status, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING transporter_id as id, *
      `;

      const values = [
        transport_master_id, status, transporter_name, contact_person || null, contact_number || null,
        email_id || null, address_line1 || null, state || null, pincode || null, pan || null, gstin || null,
        approval_status, created_by
      ];

      const result = await pool.query(query, values);
      Logger.info(`Created new transporter with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating transporter:', error);
      throw error;
    }
  }

  /**
   * Update an existing transporter.
   *
   * @param {number} id
   * @param {object} data  - the edited field values
   * @param {object} [opts]
   * @param {boolean} [opts.isAdmin=true] - admin/super_admin write directly; others are staged for approval
   * @param {number}  [opts.userId=null]  - who is making the edit (recorded on staged edits)
   * @returns {Promise<object>} the row, with `staged: true` when the change awaits approval
   */
  async updateTransporter(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = TransportMasterService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE transport_master
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW()
           WHERE transporter_id = $3 AND approval_status = 'approved'
           RETURNING transporter_id as id, *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved transporter with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Transporter ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging transporter edit ${id}:`, error);
        throw error;
      }
    }

    try {
      const {
        transport_master_id,
        status,
        transporter_name,
        contact_person,
        contact_number,
        email_id,
        address_line1,
        state,
        pincode,
        pan,
        gstin
      } = data;

      const query = `
        UPDATE transport_master
        SET 
          transport_master_id = $1,
          status = $2,
          transporter_name = $3,
          contact_person = $4,
          contact_number = $5,
          email_id = $6,
          address_line1 = $7,
          state = $8,
          pincode = $9,
          pan = $10,
          gstin = $11
        WHERE transporter_id = $12
        RETURNING transporter_id as id, *
      `;

      const values = [
        transport_master_id, status, transporter_name, contact_person || null, contact_number || null,
        email_id || null, address_line1 || null, state || null, pincode || null, pan || null, gstin || null, id
      ];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Transporter with ID ${id} not found`);
      }

      Logger.info(`Updated transporter ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating transporter ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a transporter (Soft delete by setting status to Inactive)
   */
  async deleteTransporter(id) {
    try {
      const query = `
        DELETE FROM transport_master
        WHERE transporter_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Transporter with ID ${id} not found`);
      }

      Logger.info(`Deleted transporter ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting transporter ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new TransportMasterService();
