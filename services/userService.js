/**
 * User Service
 * Handles CRUD operations for user management with role-based access control
 */

const db = require('../config/db');
const { Logger } = require('../utils');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

class UserService {
  /**
   * Get all users
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} List of users with passwords masked
   */
  async getAllUsers(params = {}) {
    try {
      const { page = 1, limit = 100, role, status } = params;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          id, username, email, phone_no, status, role, page_access, 
          created_at, updated_at
        FROM login
        WHERE 1=1
      `;
      const queryParams = [];
      let paramIndex = 1;

      if (role) {
        query += ` AND role = $${paramIndex++}`;
        queryParams.push(role);
      }
      
      if (status) {
        query += ` AND status = $${paramIndex++}`;
        queryParams.push(status);
      }

      query += ` ORDER BY created_at DESC`;
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      queryParams.push(limit, offset);

      const result = await db.query(query, queryParams);
      
      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM login WHERE 1=1';
      const countParams = [];
      let countIndex = 1;
      
      if (role) {
        countQuery += ` AND role = $${countIndex++}`;
        countParams.push(role);
      }
      if (status) {
        countQuery += ` AND status = $${countIndex++}`;
        countParams.push(status);
      }
      
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        users: result.rows.map(user => ({
          ...user,
          password: '••••••••' // Mask password in response
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      Logger.error('Error fetching users', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object>} User object
   */
  async getUserById(id) {
    try {
      const query = `
        SELECT 
          id, username, email, phone_no, status, role, page_access, 
          created_at, updated_at
        FROM login
        WHERE id = $1
      `;
      
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        ...result.rows[0],
        password: '••••••••'
      };
    } catch (error) {
      Logger.error('Error fetching user by ID', error);
      throw error;
    }
  }

  /**
   * Create new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    try {
      const { username, password, email, phone_no, status = 'active', role, page_access = [] } = userData;
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      
      const query = `
        INSERT INTO login (username, password, email, phone_no, status, role, page_access)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, username, email, phone_no, status, role, page_access, created_at, updated_at
      `;
      
      const result = await db.query(query, [
        username,
        hashedPassword,
        email,
        phone_no,
        status,
        role,
        page_access
      ]);
      
      return {
        ...result.rows[0],
        password: '••••••••'
      };
    } catch (error) {
      Logger.error('Error creating user', error);
      
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'login_username_key') {
          throw new Error('Username already exists');
        }
        if (error.constraint === 'login_email_key') {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    }
  }

  /**
   * Update user
   * @param {number} id - User ID
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} Updated user
   */
  async updateUser(id, userData) {
    try {
      const { username, password, email, phone_no, status, role, page_access } = userData;
      
      // Build dynamic update query
      const updateFields = [];
      const queryParams = [];
      let paramIndex = 1;

      if (username !== undefined) {
        updateFields.push(`username = $${paramIndex++}`);
        queryParams.push(username);
      }
      
      if (password !== undefined && password !== '••••••••' && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        updateFields.push(`password = $${paramIndex++}`);
        queryParams.push(hashedPassword);
      }
      
      if (email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        queryParams.push(email);
      }
      
      if (phone_no !== undefined) {
        updateFields.push(`phone_no = $${paramIndex++}`);
        queryParams.push(phone_no);
      }
      
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        queryParams.push(status);
      }
      
      if (role !== undefined) {
        updateFields.push(`role = $${paramIndex++}`);
        queryParams.push(role);
      }
      
      if (page_access !== undefined) {
        updateFields.push(`page_access = $${paramIndex++}`);
        queryParams.push(page_access);
      }

      if (updateFields.length === 0) {
        return this.getUserById(id);
      }

      queryParams.push(id);
      
      const query = `
        UPDATE login 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, username, email, phone_no, status, role, page_access, created_at, updated_at
      `;
      
      const result = await db.query(query, queryParams);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        ...result.rows[0],
        password: '••••••••'
      };
    } catch (error) {
      Logger.error('Error updating user', error);
      
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'login_username_key') {
          throw new Error('Username already exists');
        }
        if (error.constraint === 'login_email_key') {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    }
  }

  /**
   * Delete user
   * @param {number} id - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteUser(id) {
    try {
      const query = 'DELETE FROM login WHERE id = $1 RETURNING id';
      const result = await db.query(query, [id]);
      
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('Error deleting user', error);
      throw error;
    }
  }

  /**
   * Authenticate user
   * @param {string} username - Username
   * @param {string} password - Plain text password
   * @returns {Promise<Object|null>} User object if authenticated, null otherwise
   */
  async authenticateUser(username, password) {
    try {
      const query = `
        SELECT id, username, password, email, phone_no, status, role, page_access, created_at, updated_at
        FROM login
        WHERE username = $1 AND status = 'active'
      `;
      
      const result = await db.query(query, [username]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return null;
      }
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      Logger.error('Error authenticating user', error);
      throw error;
    }
  }

  /**
   * Get available page access options
   * @returns {Array<string>} List of page names
   */
  getPageAccessOptions() {
    return [
      'Dashboard',
      'Order Punch',
      'Pre Approval',
      'Approval of Order',
      'Dispatch Planning',
      'Actual Dispatch',
      'Vehicle Details',
      'Material Load',
      'Security Guard Approval',
      'Make Invoice',
      'Check Invoice',
      'Gate Out',
      'Confirm Material Receipt',
      'Damage Adjustment',
      'Settings'
    ];
  }
}

module.exports = new UserService();
