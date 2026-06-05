const productionService = require('../services/productionService');
const { Logger } = require('../utils');

async function getByDate(req, res) {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });
    const data = await productionService.getByDate(date);
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error fetching production data', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function bulkUpsert(req, res) {
  try {
    const { date, items } = req.body;
    if (!date || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'date and items[] are required' });
    }
    const data = await productionService.bulkUpsert(date, items);
    res.json({ success: true, data });
  } catch (error) {
    Logger.error('Error saving production data', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getByDate, bulkUpsert };
