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
      let whereClause = "";
      
      if (!all) {
        whereClause = " WHERE status = 'Active'";
      }
      
      if (search) {
        const searchPattern = `%${search}%`;
        const searchIndex = values.length + 1;
        values.push(searchPattern);
        whereClause += whereClause ? " AND " : " WHERE ";
        whereClause += `(driver_name ILIKE $${searchIndex} OR driver_master_id ILIKE $${searchIndex} OR mobile_no ILIKE $${searchIndex} OR driving_licence_no ILIKE $${searchIndex})`;
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM driver_master ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      let query = `
        SELECT 
          driver_id as id, driver_master_id, status, driving_licence_no, driving_licence_type, 
          valid_upto, rto, driver_name, mobile_no, email_id, 
          address_line1, state, pincode, aadhaar_no, pan_no, aadhaar_upload, created_at
        FROM driver_master
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      
      values.push(limit, offset);
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
          address_line1, state, pincode, aadhaar_no, pan_no, aadhaar_upload, created_at
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
        aadhaar_upload
      } = data;

      const query = `
        INSERT INTO driver_master (
          driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto, 
          rto, driver_name, mobile_no, email_id, address_line1, 
          state, pincode, aadhaar_no, pan_no, aadhaar_upload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING driver_id as id, *
      `;

      const values = [
        driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto || null,
        rto, driver_name, mobile_no, email_id || null, address_line1 || null,
        state || null, pincode || null, aadhaar_no || null, pan_no || null, aadhaar_upload || null
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
        aadhaar_upload
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
          aadhaar_upload = $15
        WHERE driver_id = $16
        RETURNING driver_id as id, *
      `;

      const values = [
        driver_master_id, status, driving_licence_no, driving_licence_type, valid_upto || null,
        rto, driver_name, mobile_no, email_id || null, address_line1 || null,
        state || null, pincode || null, aadhaar_no || null, pan_no || null, aadhaar_upload || null, id
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
        UPDATE driver_master
        SET status = 'Inactive'
        WHERE driver_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Driver with ID ${id} not found`);
      }

      Logger.info(`Soft deleted driver ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting driver ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DriverMasterService();
