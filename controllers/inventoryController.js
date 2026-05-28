const inventoryService = require('../services/inventoryService');
const { Logger } = require('../utils');

async function getInventoryData(req, res) {
  try {
    const data = await inventoryService.getInventoryData();
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
    const result = await inventoryService.upsertOpeningQty(depo_name, product_name, parseInt(opening_qty) || 0);
    res.json({ success: true, data: result });
  } catch (error) {
    Logger.error('Error saving opening qty', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getInventoryDetail(req, res) {
  try {
    const { depot_name, product_name, type } = req.query;
    if (!depot_name || !product_name || !type) {
      return res.status(400).json({ success: false, message: 'depot_name, product_name, and type are required' });
    }
    const data = await inventoryService.getInventoryDetail(depot_name, product_name, type);
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error fetching inventory detail', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getInventoryData, upsertOpeningQty, getInventoryDetail };
