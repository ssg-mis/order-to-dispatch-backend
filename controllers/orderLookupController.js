const orderLookupService = require('../services/orderLookupService');
const { Logger } = require('../utils');

async function lookupByDoNumber(req, res) {
  try {
    const result = await orderLookupService.lookupByDoNumber(req.query.search);
    res.json(result);
  } catch (error) {
    Logger.error('Error in lookupByDoNumber controller', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { lookupByDoNumber };
