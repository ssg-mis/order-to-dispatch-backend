const transportMasterService = require('../services/transportMasterService');
const Logger = require('../utils/logger');

/**
 * Get all transporters with pagination and search
 */
const getAllTransporters = async (req, res, next) => {
  try {
    const { all, page, limit, search } = req.query;
    const result = await transportMasterService.getAllTransporters({ all, page, limit, search });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Controller Error - getAllTransporters:', error);
    next(error);
  }
};

/**
 * Get transporter by ID
 */
const getTransporterById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.getTransporterById(id);
    
    if (!transporter) {
      return res.status(404).json({
        success: false,
        message: 'Transporter not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - getTransporterById:', error);
    next(error);
  }
};

/**
 * Create new transporter
 */
const createTransporter = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const transporter = await transportMasterService.createTransporter({ ...req.body, approval_status: isAdmin ? 'approved' : 'pending', created_by: req.user?.id || null });
    res.status(201).json({ success: true, message: isAdmin ? 'Transporter created successfully' : 'Transporter submitted for approval', data: transporter });
  } catch (error) {
    Logger.error('Controller Error - createTransporter:', error);
    next(error);
  }
};

/**
 * Update transporter
 */
const updateTransporter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.updateTransporter(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Transporter updated successfully',
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - updateTransporter:', error);
    next(error);
  }
};

/**
 * Delete transporter (soft delete)
 */
const deleteTransporter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transporter = await transportMasterService.deleteTransporter(id);
    
    res.status(200).json({
      success: true,
      message: 'Transporter deleted successfully',
      data: transporter
    });
  } catch (error) {
    Logger.error('Controller Error - deleteTransporter:', error);
    next(error);
  }
};

const getPendingTransporters = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    res.status(200).json({ success: true, data: await transportMasterService.getPendingTransporters() });
  } catch (error) { next(error); }
};

const reviewTransporter = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    const transporter = await transportMasterService.reviewTransporter(req.params.id, action, req.user.id, reason);
    res.status(200).json({ success: true, message: `Transporter ${action === 'approve' ? 'approved' : 'rejected'} successfully`, data: transporter });
  } catch (error) { next(error); }
};

module.exports = {
  getAllTransporters,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  getPendingTransporters,
  reviewTransporter
};
