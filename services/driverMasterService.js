/**
 * Driver Master Service
 * Handles operations for driver_master table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class DriverMasterService {
  /**
   * Get all drivers
   */
  async getAllDrivers(params = {}) {
    try {
      const { all, page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];
      const conditions = ["approval_status = 'approved'", "status = 'Active'"];
      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(driver_name ILIKE $${values.length} OR driver_master_id ILIKE $${values.length} OR mobile_no ILIKE $${values.length} OR driving_licence_no ILIKE $${values.length})`);
      }
      const whereClause = " WHERE " + conditions.join(" AND ");

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM driver_master ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data (skip LIMIT/OFFSET when fetching all for dropdowns)
      let query = `
        SELECT
          driver_id as id, driver_master_id, status, driving_licence_no, driving_licence_type,
          valid_upto, rto, driver_name, mobile_no, email_id,
          address_line1, state, pincode, aadhaar_no, pan_no, aadhaar_upload, dl_upload, created_at
        FROM driver_master
        ${whereClause}
        ORDER BY created_at DESC
        ${all ? '' : `LIMIT $${values.length + 1} OFFSET $${values.length + 2}`}
      `;

      if (!all) values.push(limit, offset);
      const result = await pool.query(query, values);
      
      Logger.info(`Fetched ${result.rows.length} drivers (total: ${total}, search: "${search}")`);
      return {
        drivers: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching drivers:', error);
      throw error;
    }
  }

  /**
   * Get driver by ID
   */
  async getDriverById(id) {
    try {
      const query = `
        SELECT 
          driver_id as id, driver_master_id, status, driving_licence_no, driving_licence_type,
          valid_upto, rto, driver_name, mobile_no, email_id,
          address_line1, state, pincode, aadhaar_no, pan_no, aadhaar_upload, dl_upload, created_at
        FROM driver_master
        WHERE driver_id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching driver ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new driver
   */
  async getPendingDrivers() {
    try {
      const result = await pool.query(`
        SELECT dm.driver_id as id, dm.driver_master_id, dm.driver_name, dm.mobile_no,
               dm.driving_licence_no, dm.status, dm.rejection_reason, dm.created_at, l.username AS created_by_name
        FROM driver_master dm LEFT JOIN login l ON l.id = dm.created_by
        WHERE dm.approval_status = 'pending' ORDER BY dm.created_at ASC
      `);
      return result.rows;
    } catch (error) { Logger.error('Error fetching pending drivers:', error); throw error; }
  }

  async reviewDriver(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      const ALLOWED = ['driver_name','mobile_no','driving_licence_no','driving_licence_type','valid_upto','rto','status'];
      const safe = action === 'approve'
        ? Object.fromEntries(Object.entries(overrides).filter(([k]) => ALLOWED.includes(k)))
        : {};
      const params = [approvalStatus, reviewedBy, reason || null];
      let setCols = 'approval_status=$1, reviewed_by=$2, rejection_reason=$3';
      let n = 4;
      for (const [col, val] of Object.entries(safe)) { setCols += `, ${col}=$${n++}`; params.push(val); }
      params.push(id);
      const result = await pool.query(
        `UPDATE driver_master SET ${setCols} WHERE driver_id=$${n} AND approval_status='pending' RETURNING driver_id as id, *`,
        params
      );
      if (!result.rows.length) throw new Error(`Pending driver ${id} not found`);
      return result.rows[0];
    } catch (error) { Logger.error(`Error reviewing driver ${id}:`, error); throw error; }
  }

  async createDriver(data) {
    try {
      const {
        driver_master_id,
        status = 'Active',
        driving_licence_no,
        driving_licence_type,
        valid_upto,
        rto,
        driver_name,
        mobile_no,
        email_id,
        address_line1,
        state,
        pincode,
        aadhaar_no,
        pan_no,
        aadhaar_upload,
        dl_upload,
        approval_status = 'approved',
        created_by = null
      } = data;

      const query = `
        INSERT INTO driver_master (
          driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto,
          rto, driver_name, mobile_no, email_id, address_line1,
          state, pincode, aadhaar_no, pan_no, aadhaar_upload, dl_upload, approval_status, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING driver_id as id, *
      `;

      const values = [
        driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto || null,
        rto, driver_name, mobile_no, email_id || null, address_line1 || null,
        state || null, pincode || null, aadhaar_no || null, pan_no || null, aadhaar_upload || null, dl_upload || null,
        approval_status, created_by
      ];

      const result = await pool.query(query, values);
      Logger.info(`Created new driver with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating driver:', error);
      throw error;
    }
  }

  /**
   * Update an existing driver
   */
  async updateDriver(id, data) {
    try {
      const {
        driver_master_id,
        status,
        driving_licence_no,
        driving_licence_type,
        valid_upto,
        rto,
        driver_name,
        mobile_no,
        email_id,
        address_line1,
        state,
        pincode,
        aadhaar_no,
        pan_no,
        aadhaar_upload,
        dl_upload
      } = data;

      const query = `
        UPDATE driver_master
        SET
          driver_master_id = $1,
          status = $2,
          driving_licence_no = $3,
          driving_licence_type = $4,
          valid_upto = $5,
          rto = $6,
          driver_name = $7,
          mobile_no = $8,
          email_id = $9,
          address_line1 = $10,
          state = $11,
          pincode = $12,
          aadhaar_no = $13,
          pan_no = $14,
          aadhaar_upload = $15,
          dl_upload = $16
        WHERE driver_id = $17
        RETURNING driver_id as id, *
      `;

      const values = [
        driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto || null,
        rto, driver_name, mobile_no, email_id || null, address_line1 || null,
        state || null, pincode || null, aadhaar_no || null, pan_no || null, aadhaar_upload || null, dl_upload || null, id
      ];

      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Driver with ID ${id} not found`);
      }

      Logger.info(`Updated driver ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating driver ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a driver (Soft delete by setting status to Inactive)
   */
  async deleteDriver(id) {
    try {
      const query = `
        DELETE FROM driver_master
        WHERE driver_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Driver with ID ${id} not found`);
      }

      Logger.info(`Deleted driver ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting driver ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DriverMasterService();
