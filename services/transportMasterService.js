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
      let whereClause = "";
      
      if (!all) {
        whereClause = " WHERE status = 'Active'";
      }
      
      if (search) {
        const searchPattern = `%${search}%`;
        const searchIndex = values.length + 1;
        values.push(searchPattern);
        whereClause += whereClause ? " AND " : " WHERE ";
        whereClause += `(transporter_name ILIKE $${searchIndex} OR transport_master_id ILIKE $${searchIndex} OR contact_person ILIKE $${searchIndex} OR contact_number ILIKE $${searchIndex})`;
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM transport_master ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated data
      let query = `
        SELECT 
          transporter_id as id, transport_master_id, status, transporter_name, contact_person, 
          contact_number, email_id, address_line1, state, pincode, pan, gstin, created_at
        FROM transport_master
        ${whereClause}
        ORDER BY created_at DESC
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
        gstin
      } = data;

      const query = `
        INSERT INTO transport_master (
          transport_master_id, status, transporter_name, contact_person, contact_number, 
          email_id, address_line1, state, pincode, pan, gstin
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING transporter_id as id, *
      `;

      const values = [
        transport_master_id, status, transporter_name, contact_person || null, contact_number || null,
        email_id || null, address_line1 || null, state || null, pincode || null, pan || null, gstin || null
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
   * Update an existing transporter
   */
  async updateTransporter(id, data) {
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
        UPDATE transport_master
        SET status = 'Inactive'
        WHERE transporter_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Transporter with ID ${id} not found`);
      }

      Logger.info(`Soft deleted transporter ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting transporter ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new TransportMasterService();
