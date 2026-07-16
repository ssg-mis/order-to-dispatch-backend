/**
 * Depot Details Service
 * Handles operations for depot_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class DepotService {
  /**
   * Get all active depots
   */
  // v2 schema: delegate to the shared master-lookup helper.
  async getAllDepots(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { schema } = require('../config/db-v2.ts');
      const { rows, total } = await masterLookup(schema.depots, {
        nameColumn: 'depotName',
        searchColumns: ['depotName', 'depotCode', 'state', 'depotAddress'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} depots (total: ${total})`);
      return { depots: rows, pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total } };
    } catch (error) {
      Logger.error('Error fetching depots:', error);
      throw error;
    }
  }

  /**
   * Get depot by ID
   */
  async getDepotById(depotId) {
    try {
      const query = `
        SELECT 
          depot_id,
          depot_name,
          status,
          depot_address,
          state,
          salesman_broker_name
        FROM depot_details
        WHERE depot_id = $1
      `;
      
      const result = await pool.query(query, [depotId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched depot details for ID: ${depotId}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching depot ${depotId}:`, error);
      throw error;
    }
  }

  /**
   * Get depot by name
   */
  async getDepotByName(depotName) {
    try {
      const query = `
        SELECT 
          depot_id,
          depot_name,
          status,
          depot_address,
          state,
          salesman_broker_name
        FROM depot_details
        WHERE depot_name = $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [depotName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      Logger.info(`Fetched depot details for: ${depotName}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching depot by name ${depotName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new depot
   */
  async getPendingDepots() {
    try {
      // Two kinds of pending records share this list:
      //  - 'create': a brand-new depot awaiting approval (approval_status = 'pending')
      //  - 'edit'  : an approved depot with a staged change in pending_changes
      const result = await pool.query(`
        SELECT dd.depot_id, dd.depot_name, dd.status, dd.depot_address, dd.state,
               dd.salesman_broker_name, dd.rejection_reason, dd.created_at,
               dd.pending_changes, dd.pending_edit_at,
               CASE WHEN dd.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
               l.username  AS created_by_name,
               le.username AS pending_edit_by_name
        FROM depot_details dd
        LEFT JOIN login l  ON l.id  = dd.created_by
        LEFT JOIN login le ON le.id = dd.pending_edit_by
        WHERE dd.approval_status = 'pending' OR dd.pending_changes IS NOT NULL
        ORDER BY COALESCE(dd.pending_edit_at, dd.created_at) ASC
      `);
      Logger.info(`Fetched ${result.rows.length} pending depots (creates + edits)`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching pending depots:', error);
      throw error;
    }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (depot_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return ['depot_name','depot_address','state','salesman_broker_name','status'];
  }

  async reviewDepot(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = DepotService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM depot_details WHERE depot_id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Depot with ID ${id} not found`);
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
            `UPDATE depot_details SET ${setCols} WHERE depot_id=$${n} RETURNING *`,
            params
          );
          Logger.info(`Depot ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE depot_details
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2
           WHERE depot_id=$3 RETURNING *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Depot ${id} edit rejected by user ${reviewedBy}`);
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
        `UPDATE depot_details SET ${setCols} WHERE depot_id=$${n} AND approval_status='pending' RETURNING *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending depot with ID ${id} not found`);
      Logger.info(`Depot ${id} ${approvalStatus} by user ${reviewedBy}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error reviewing depot ${id}:`, error);
      throw error;
    }
  }

  async createDepot(data) {
    try {
      const {
        depot_id,
        depot_name,
        status = 'Active',
        depot_address,
        state,
        salesman_broker_name,
        approval_status = 'approved',
        created_by = null
      } = data;

      const query = `
        INSERT INTO depot_details (
          depot_id, depot_name, status, depot_address, state, salesman_broker_name,
          approval_status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [depot_id, depot_name, status, depot_address, state, salesman_broker_name, approval_status, created_by];

      const result = await pool.query(query, values);
      Logger.info(`Created new depot with ID: ${result.rows[0].depot_id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating depot:', error);
      throw error;
    }
  }

  /**
   * Update an existing depot
   */
  async updateDepot(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = DepotService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE depot_details
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW()
           WHERE depot_id = $3 AND approval_status = 'approved'
           RETURNING *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved depot with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Depot ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging depot edit ${id}:`, error);
        throw error;
      }
    }

    try {
      const {
        depot_name,
        status,
        depot_address,
        state,
        salesman_broker_name
      } = data;

      const query = `
        UPDATE depot_details
        SET 
          depot_name = $1,
          status = $2,
          depot_address = $3,
          state = $4,
          salesman_broker_name = $5
        WHERE depot_id = $6
        RETURNING *
      `;

      const values = [depot_name, status, depot_address, state, salesman_broker_name, id];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Depot with ID ${id} not found`);
      }

      Logger.info(`Updated depot ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating depot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a depot
   */
  async deleteDepot(id) {
    try {
      const query = `
        DELETE FROM depot_details
        WHERE depot_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Depot with ID ${id} not found`);
      }

      Logger.info(`Deleted depot ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting depot ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DepotService();
