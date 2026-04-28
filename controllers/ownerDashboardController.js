/**
 * Owner Dashboard Controller
 */

const ownerDashboardService = require('../services/ownerDashboardService');
const { Logger } = require('../utils');

class OwnerDashboardController {
  async getFullDashboard(req, res, next) {
    try {
      const filters = {
        depot:      req.query.depot      || null,
        order_type: req.query.order_type || null,
        date_from:  req.query.date_from  || null,
        date_to:    req.query.date_to    || null,
      };

      const data = await ownerDashboardService.getFullDashboard(filters);

      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      Logger.error('Error in getFullDashboard controller', err);
      next(err);
    }
  }
}

module.exports = new OwnerDashboardController();
