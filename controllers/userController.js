/**
 * User Controller
 * Handles HTTP requests for user management
 */

const userService = require('../services/userService');
const { Logger } = require('../utils');

/**
 * Get all users
 */
const getAllUsers = async (req, res) => {
  try {
    const { page, limit, role, status } = req.query;
    
    const result = await userService.getAllUsers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 100,
      role,
      status
    });
    
    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in getAllUsers controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve users',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await userService.getUserById(parseInt(id));
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: 'User retrieved successfully',
      data: user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in getUserById controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve user',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Create new user
 */
const createUser = async (req, res) => {
  try {
    const { username, password, email, phone_no, status, role, page_access } = req.body;
    
    // Validate required fields
    if (!username || !password || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, email, and role are required',
        timestamp: new Date().toISOString()
      });
    }
    
    const newUser = await userService.createUser({
      username,
      password,
      email,
      phone_no,
      status,
      role,
      page_access
    });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in createUser controller', error);
    
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to create user',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Update user
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const updatedUser = await userService.updateUser(parseInt(id), updateData);
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in updateUser controller', error);
    
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to update user',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deleted = await userService.deleteUser(parseInt(id));
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in deleteUser controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete user',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Authenticate user (login)
 */
const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        timestamp: new Date().toISOString()
      });
    }
    
    const user = await userService.authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: 'Login successful',
      data: user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in loginUser controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get page access options
 */
const getPageAccessOptions = async (req, res) => {
  try {
    const options = userService.getPageAccessOptions();
    
    res.json({
      success: true,
      message: 'Page access options retrieved successfully',
      data: options,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in getPageAccessOptions controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve page access options',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  getPageAccessOptions
};
