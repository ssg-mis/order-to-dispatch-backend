/**
 * Vehicle Master Service
 * Handles operations for vehicle_master table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class VehicleMasterService {
  /**
   * Get all vehicles
   */
  async getAllVehicles(params = {}) {
    try {
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];

      const conditions = ["approval_status = 'approved'"];
      if (!all) conditions.push("status = 'Active'");
      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(registration_no ILIKE $${values.length} OR vehicle_master_id ILIKE $${values.length} OR vehicle_type ILIKE $${values.length} OR transporter ILIKE $${values.length})`);
      }
      const whereClause = " WHERE " + conditions.join(" AND ");

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM vehicle_master ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data (skip LIMIT/OFFSET when fetching all for dropdowns)
      let query = `
        SELECT
          vehicle_id as id, vehicle_master_id, status, registration_no, vehicle_type,
          transporter, rto, road_tax, road_tax_image, pollution,
          pollution_image, insurance, insurance_image, fitness,
          fitness_image, state_permit, state_permit_image, state_permit_type, fuel_type, gvw, ulw, passing, created_at,
          life_time_tax, life_time_tax_image,
          (pending_changes IS NOT NULL) AS has_pending_edit
        FROM vehicle_master
        ${whereClause}
        ORDER BY created_at DESC
        ${all ? '' : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`}
      `;

      if (!all) values.push(limit, offset);
      const result = await pool.query(query, values);
      
      Logger.info(`Fetched ${result.rows.length} vehicles (total: ${total}, search: "${search}")`);
      return {
        vehicles: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching vehicles:', error);
      throw error;
    }
  }

  /**
   * Get vehicle by ID
   */
  async getVehicleById(id) {
    try {
      const query = `
        SELECT 
          vehicle_id as id, vehicle_master_id, status, registration_no, vehicle_type, 
          transporter, rto, road_tax, road_tax_image, pollution, 
          pollution_image, insurance, insurance_image, fitness, 
          fitness_image, state_permit, state_permit_image, state_permit_type, fuel_type, gvw, ulw, passing, created_at,
          life_time_tax, life_time_tax_image
        FROM vehicle_master
        WHERE vehicle_id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching vehicle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new vehicle
   */
  async getPendingVehicles() {
    try {
      // Two kinds of pending records share this list:
      //  - 'create': a brand-new vehicle awaiting approval (approval_status = 'pending')
      //  - 'edit'  : an approved vehicle with a staged change in pending_changes
      const result = await pool.query(`
        SELECT vm.vehicle_id as id, vm.vehicle_master_id, vm.registration_no, vm.vehicle_type,
               vm.transporter, vm.status, vm.rto, vm.road_tax, vm.road_tax_image, vm.pollution,
               vm.pollution_image, vm.insurance, vm.insurance_image, vm.fitness, vm.fitness_image,
               vm.state_permit, vm.state_permit_image, vm.state_permit_type, vm.fuel_type,
               vm.gvw, vm.ulw, vm.passing, vm.life_time_tax, vm.life_time_tax_image,
               vm.rejection_reason, vm.created_at,
               vm.pending_changes, vm.pending_edit_at,
               CASE WHEN vm.approval_status = 'pending' THEN 'create' ELSE 'edit' END AS request_type,
               l.username  AS created_by_name,
               le.username AS pending_edit_by_name
        FROM vehicle_master vm
        LEFT JOIN login l  ON l.id  = vm.created_by
        LEFT JOIN login le ON le.id = vm.pending_edit_by
        WHERE vm.approval_status = 'pending' OR vm.pending_changes IS NOT NULL
        ORDER BY COALESCE(vm.pending_edit_at, vm.created_at) ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending vehicles:', error); throw error; }
  }

  // Editable columns a non-admin may change / an admin may override on approval.
  // (vehicle_master_id is the system identifier and is intentionally excluded.)
  static get EDITABLE_COLUMNS() {
    return [
      'registration_no','vehicle_type','transporter','rto','status','fuel_type',
      'gvw','ulw','passing','state_permit_type',
      'road_tax','road_tax_image','pollution','pollution_image',
      'insurance','insurance_image','fitness','fitness_image',
      'state_permit','state_permit_image','life_time_tax','life_time_tax_image',
    ];
  }

  async reviewVehicle(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const ALLOWED = VehicleMasterService.EDITABLE_COLUMNS;

      // Determine whether this is a staged EDIT or a brand-new CREATE awaiting approval.
      const existing = await pool.query(
        'SELECT approval_status, pending_changes FROM vehicle_master WHERE vehicle_id = $1',
        [id]
      );
      if (!existing.rows.length) throw new Error(`Vehicle ${id} not found`);
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
            `UPDATE vehicle_master SET ${setCols} WHERE vehicle_id=$${n} RETURNING vehicle_id as id, *`,
            params
          );
          Logger.info(`Vehicle ID ${id} edit approved by user ${reviewedBy}`);
          return result.rows[0];
        }

        // Reject the edit: discard staged values, live record stays approved & unchanged.
        const result = await pool.query(
          `UPDATE vehicle_master
           SET pending_changes=NULL, pending_edit_by=NULL, pending_edit_at=NULL,
               rejection_reason=$1, reviewed_by=$2
           WHERE vehicle_id=$3 RETURNING vehicle_id as id, *`,
          [reason || null, reviewedBy, id]
        );
        Logger.info(`Vehicle ID ${id} edit rejected by user ${reviewedBy}`);
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
        `UPDATE vehicle_master SET ${setCols} WHERE vehicle_id=$${n} AND approval_status='pending' RETURNING vehicle_id as id, *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending vehicle ${id} not found`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing vehicle ${id}:`, error); throw error; }
  }

  async createVehicle(data) {
    try {
      const {
        vehicle_master_id,
        status = 'Active',
        registration_no,
        vehicle_type,
        transporter,
        rto,
        road_tax,
        road_tax_image,
        pollution,
        pollution_image,
        insurance,
        insurance_image,
        fitness,
        fitness_image,
        state_permit,
        state_permit_image,
        state_permit_type,
        fuel_type,
        gvw,
        ulw,
        passing,
        life_time_tax,
        life_time_tax_image,
        approval_status = 'approved',
        created_by = null
      } = data;

      // ---------------------------------------------------------------
      // If a REJECTED record already exists with the same registration_no,
      // reuse it: reset to pending with the updated data instead of
      // trying to INSERT (which would fail the unique constraint).
      // ---------------------------------------------------------------
      const existingRejected = await pool.query(
        `SELECT vehicle_id FROM vehicle_master
         WHERE UPPER(TRIM(registration_no)) = UPPER(TRIM($1))
           AND approval_status = 'rejected'
         LIMIT 1`,
        [registration_no]
      );

      if (existingRejected.rows.length > 0) {
        const rejectedId = existingRejected.rows[0].vehicle_id;
        Logger.info(`Re-using rejected vehicle record ${rejectedId} for registration_no "${registration_no}"`);
        const resubmitResult = await pool.query(
          `UPDATE vehicle_master SET
             status = $1, vehicle_type = $2, transporter = $3, rto = $4,
             road_tax = $5, road_tax_image = $6, pollution = $7, pollution_image = $8,
             insurance = $9, insurance_image = $10, fitness = $11, fitness_image = $12,
             state_permit = $13, state_permit_image = $14, state_permit_type = $15,
             fuel_type = $16, gvw = $17, ulw = $18, passing = $19,
             life_time_tax = $20, life_time_tax_image = $21,
             approval_status = $22, rejection_reason = NULL,
             reviewed_by = NULL, created_by = $23, created_at = NOW()
           WHERE vehicle_id = $24
           RETURNING vehicle_id as id, *`,
          [
            status, vehicle_type, transporter, rto,
            road_tax || null, road_tax_image || null, pollution || null, pollution_image || null,
            insurance || null, insurance_image || null, fitness || null, fitness_image || null,
            state_permit || null, state_permit_image || null, state_permit_type || null,
            fuel_type || null, gvw || 0, ulw || 0, passing || 0,
            life_time_tax || null, life_time_tax_image || null,
            approval_status, created_by, rejectedId
          ]
        );
        return { ...resubmitResult.rows[0], resubmitted: true };
      }

      // Normal INSERT for a brand-new registration number
      const query = `
        INSERT INTO vehicle_master (
          vehicle_master_id, status, registration_no, vehicle_type, transporter,
          rto, road_tax, road_tax_image, pollution, pollution_image,
          insurance, insurance_image, fitness, fitness_image, state_permit,
          state_permit_image, state_permit_type, fuel_type, gvw, ulw, passing, life_time_tax, life_time_tax_image, approval_status, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        RETURNING vehicle_id as id, *
      `;

      const values = [
        vehicle_master_id, status, registration_no, vehicle_type, transporter,
        rto, road_tax || null, road_tax_image || null, pollution || null, pollution_image || null,
        insurance || null, insurance_image || null, fitness || null, fitness_image || null, state_permit || null,
        state_permit_image || null, state_permit_type || null, fuel_type || null, gvw || 0, ulw || 0, passing || 0, life_time_tax || null, life_time_tax_image || null, approval_status, created_by
      ];

      const result = await pool.query(query, values);
      Logger.info(`Created new vehicle with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating vehicle:', error);
      throw error;
    }
  }

  /**
   * Update an existing vehicle
   */
  async updateVehicle(id, data, opts = {}) {
    const { isAdmin = true, userId = null } = opts;

    // Non-admins: stage the change in pending_changes instead of touching the live row.
    if (!isAdmin) {
      try {
        const ALLOWED = VehicleMasterService.EDITABLE_COLUMNS;
        const staged = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)));
        const result = await pool.query(
          `UPDATE vehicle_master
           SET pending_changes = $1, pending_edit_by = $2, pending_edit_at = NOW()
           WHERE vehicle_id = $3 AND approval_status = 'approved'
           RETURNING vehicle_id as id, *`,
          [JSON.stringify(staged), userId, id]
        );
        if (!result.rows.length) {
          throw new Error(`Approved vehicle with ID ${id} not found (cannot stage edit)`);
        }
        Logger.info(`Vehicle ID ${id} edit staged for approval by user ${userId}`);
        return { ...result.rows[0], staged: true };
      } catch (error) {
        Logger.error(`Error staging vehicle edit ${id}:`, error);
        throw error;
      }
    }

    try {
      const {
        vehicle_master_id,
        status,
        registration_no,
        vehicle_type,
        transporter,
        rto,
        road_tax,
        road_tax_image,
        pollution,
        pollution_image,
        insurance,
        insurance_image,
        fitness,
        fitness_image,
        state_permit,
        state_permit_image,
        state_permit_type,
        fuel_type,
        gvw,
        ulw,
        passing,
        life_time_tax,
        life_time_tax_image
      } = data;

      const query = `
        UPDATE vehicle_master
        SET 
          vehicle_master_id = $1,
          status = $2,
          registration_no = $3,
          vehicle_type = $4,
          transporter = $5,
          rto = $6,
          road_tax = $7,
          road_tax_image = $8,
          pollution = $9,
          pollution_image = $10,
          insurance = $11,
          insurance_image = $12,
          fitness = $13,
          fitness_image = $14,
          state_permit = $15,
          state_permit_image = $16,
          state_permit_type = $17,
          fuel_type = $18,
          gvw = $19,
          ulw = $20,
          passing = $21,
          life_time_tax = $22,
          life_time_tax_image = $23
        WHERE vehicle_id = $24
        RETURNING vehicle_id as id, *
      `;

      const values = [
        vehicle_master_id, status, registration_no, vehicle_type, transporter,
        rto, road_tax || null, road_tax_image || null, pollution || null, pollution_image || null,
        insurance || null, insurance_image || null, fitness || null, fitness_image || null, state_permit || null,
        state_permit_image || null, state_permit_type || null, fuel_type || null, gvw || 0, ulw || 0, passing || 0, life_time_tax || null, life_time_tax_image || null, id
      ];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Vehicle with ID ${id} not found`);
      }

      Logger.info(`Updated vehicle ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating vehicle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a vehicle (Soft delete by setting status to Inactive)
   */
  async deleteVehicle(id) {
    try {
      const query = `
        DELETE FROM vehicle_master
        WHERE vehicle_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Vehicle with ID ${id} not found`);
      }

      Logger.info(`Deleted vehicle ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting vehicle ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new VehicleMasterService();
