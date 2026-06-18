/**
 * Vehicle Master Controller
 */

const vehicleMasterService = require('../services/vehicleMasterService');
const Logger = require('../utils/logger');

/**
 * Translate a raw DB / service error into a user-friendly message.
 */
function friendlyError(error) {
  const msg = error?.message || '';
  const code = error?.code || '';

  // PostgreSQL unique-constraint violation
  if (code === '23505') {
    if (msg.includes('registration_no')) return 'A vehicle with this Registration Number already exists.';
    if (msg.includes('vehicle_master_id')) return 'A vehicle with this Vehicle ID already exists.';
    return 'A duplicate record already exists.';
  }
  // PostgreSQL not-null violation
  if (code === '23502') {
    const match = msg.match(/column "(.*?)"/);
    const col = match ? match[1].replace(/_/g, ' ') : 'a required field';
    return `Missing required value: ${col}.`;
  }
  // PostgreSQL foreign-key violation
  if (code === '23503') return 'Related record not found. Please check your inputs.';
  // PostgreSQL check constraint violation
  if (code === '23514') return 'One or more values are out of the allowed range.';
  // Service-level guard messages
  if (msg.includes('not found')) return msg;
  if (msg.includes('cannot stage edit')) return 'Cannot submit edit — the vehicle record is not in an approved state.';
  // Fallback — still better than nothing
  return msg || 'An unexpected error occurred. Please try again.';
}

/**
 * Get all vehicles
 */
async function getAllVehicles(req, res) {
  try {
    const result = await vehicleMasterService.getAllVehicles(req.query);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    Logger.error('Error in getAllVehicles controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles',
      error: error.message
    });
  }
}

/**
 * Get vehicle by ID
 */
async function getVehicleById(req, res) {
  try {
    const { id } = req.params;
    const vehicle = await vehicleMasterService.getVehicleById(id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    Logger.error('Error in getVehicleById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle',
      error: error.message
    });
  }
}

/**
 * Create a new vehicle
 */
async function createVehicle(req, res) {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const vehicle = await vehicleMasterService.createVehicle({ ...req.body, approval_status: isAdmin ? 'approved' : 'pending', created_by: req.user?.id || null });
    res.status(201).json({ success: true, message: isAdmin ? 'Vehicle created successfully' : 'Vehicle submitted for approval', data: vehicle });
  } catch (error) {
    Logger.error('Error in createVehicle controller:', error);
    res.status(500).json({ success: false, message: friendlyError(error) });
  }
}

async function getPendingVehicles(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    res.status(200).json({ success: true, data: await vehicleMasterService.getPendingVehicles() });
  } catch (error) { res.status(500).json({ success: false, message: friendlyError(error) }); }
}

async function reviewVehicle(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const { action, reason, ...overrides } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    const vehicle = await vehicleMasterService.reviewVehicle(req.params.id, action, req.user.id, reason, overrides);
    res.status(200).json({ success: true, message: `Vehicle ${action === 'approve' ? 'approved' : 'rejected'} successfully`, data: vehicle });
  } catch (error) { res.status(500).json({ success: false, message: friendlyError(error) }); }
}

/**
 * Update an existing vehicle
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const vehicle = await vehicleMasterService.updateVehicle(id, req.body, {
      isAdmin,
      userId: req.user?.id || null
    });
    res.status(200).json({
      success: true,
      message: isAdmin ? 'Vehicle updated successfully' : 'Edit submitted for approval',
      data: vehicle
    });
  } catch (error) {
    Logger.error('Error in updateVehicle controller:', error);
    res.status(500).json({
      success: false,
      message: friendlyError(error)
    });
  }
}

/**
 * Delete a vehicle
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;
    await vehicleMasterService.deleteVehicle(id);
    res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    Logger.error('Error in deleteVehicle controller:', error);
    res.status(500).json({
      success: false,
      message: friendlyError(error)
    });
  }
}

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getPendingVehicles,
  reviewVehicle
};
