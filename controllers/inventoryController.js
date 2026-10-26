const inventoryService = require('../services/inventoryService');
const { Logger } = require('../utils');

async function getInventoryData(req, res) {
  try {
    const { from_date, to_date } = req.query;
    const data = await inventoryService.getInventoryData({ from_date, to_date });
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error fetching inventory data', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function upsertOpeningQty(req, res) {
  try {
    const { depo_name, product_name, opening_qty } = req.body;
    if (!depo_name || !product_name || opening_qty === undefined) {
      return res.status(400).json({ success: false, message: 'depo_name, product_name, and opening_qty are required' });
    }
    const result = await inventoryService.upsertOpeningQty(depo_name, product_name, parseInt(opening_qty) || 0, req.user);
    const staged = result?.approval_status !== 'approved' && result?.pending_opening_qty !== null;
    res.json({ success: true, message: staged ? 'Opening qty submitted for approval' : 'Opening qty saved successfully', data: result });
  } catch (error) {
    Logger.error('Error saving opening qty', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getPendingOpeningQty(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const data = await inventoryService.getPendingOpeningQty();
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error fetching pending opening qty', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function reviewOpeningQty(req, res) {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const result = await inventoryService.reviewOpeningQty(id, action, req.user.id, reason);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Pending opening qty not found' });
    }
    res.json({ success: true, message: `Opening qty ${action}d successfully`, data: result });
  } catch (error) {
    Logger.error('Error reviewing opening qty', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getInventoryDetail(req, res) {
  try {
    const { depot_name, product_name, type, from_date, to_date } = req.query;
    if (!depot_name || !product_name || !type) {
      return res.status(400).json({ success: false, message: 'depot_name, product_name, and type are required' });
    }
    const data = await inventoryService.getInventoryDetail(depot_name, product_name, type, { from_date, to_date });
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error fetching inventory detail', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getInventoryData, upsertOpeningQty, getInventoryDetail, getPendingOpeningQty, reviewOpeningQty };
