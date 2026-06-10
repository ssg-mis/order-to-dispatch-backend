/**
 * Salesperson Controller
 * Handles HTTP requests for salesperson operations
 */

const salespersonService = require('../services/salespersonService');
const Logger = require('../utils/logger');

/**
 * Get all active salespersons
 */
async function getAllSalespersons(req, res) {
  try {
    const result = await salespersonService.getAllSalespersons(req.query);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Error in getAllSalespersons controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salespersons',
      error: error.message
    });
  }
}

/**
 * Get salesperson by ID
 */
async function getSalespersonById(req, res) {
  try {
    const { id } = req.params;
    
    const salesperson = await salespersonService.getSalespersonById(id);
    
    if (!salesperson) {
      return res.status(404).json({
        success: false,
        message: `Salesperson with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: salesperson
    });
  } catch (error) {
    Logger.error('Error in getSalespersonById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salesperson',
      error: error.message
    });
  }
}

/**
 * Create a new salesperson
 */
async function createSalesperson(req, res) {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const salesperson = await salespersonService.createSalesperson({ ...req.body, approval_status: isAdmin ? 'approved' : 'pending', created_by: req.user?.id || null });
    res.status(201).json({ success: true, message: isAdmin ? 'Salesperson created successfully' : 'Salesperson submitted for approval', data: salesperson });
  } catch (error) {
    Logger.error('Error in createSalesperson controller:', error);
    res.status(500).json({ success: false, message: 'Failed to create salesperson', error: error.message });
  }
}

async function getPendingSalespersons(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    res.status(200).json({ success: true, data: await salespersonService.getPendingSalespersons() });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch pending salespersons', error: error.message }); }
}

async function reviewSalesperson(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const { action, reason, ...overrides } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    const sp = await salespersonService.reviewSalesperson(req.params.id, action, req.user.id, reason, overrides);
    res.status(200).json({ success: true, message: `Salesperson ${action === 'approve' ? 'approved' : 'rejected'} successfully`, data: sp });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to review salesperson', error: error.message }); }
}

/**
 * Update an existing salesperson
 */
async function updateSalesperson(req, res) {
  try {
    const { id } = req.params;
    const salesperson = await salespersonService.updateSalesperson(id, req.body);
    
    res.status(200).json({
      success: true,
      message: 'Salesperson updated successfully',
      data: salesperson
    });
  } catch (error) {
    Logger.error('Error in updateSalesperson controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update salesperson',
      error: error.message
    });
  }
}

/**
 * Delete a salesperson
 */
async function deleteSalesperson(req, res) {
  try {
    const { id } = req.params;
    await salespersonService.deleteSalesperson(id);
    
    res.status(200).json({
      success: true,
      message: 'Salesperson deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteSalesperson controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete salesperson',
      error: error.message
    });
  }
}

module.exports = {
  getAllSalespersons,
  getSalespersonById,
  createSalesperson,
  updateSalesperson,
  deleteSalesperson,
  getPendingSalespersons,
  reviewSalesperson
};
