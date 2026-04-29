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

  async getCustomerOrders(req, res, next) {
    try {
      const customer = req.query.customer;
      if (!customer) return res.status(400).json({ success: false, message: 'customer is required' });
      const filters = { depot: req.query.depot || null, order_type: req.query.order_type || null, date_from: req.query.date_from || null, date_to: req.query.date_to || null };
      const data = await ownerDashboardService.getCustomerOrders(customer, filters);
      res.status(200).json({ success: true, data });
    } catch (err) { Logger.error('getCustomerOrders', err); next(err); }
  }

  async getOrderJourney(req, res, next) {
    try {
      const orderNo = req.query.orderNo;
      if (!orderNo) return res.status(400).json({ success: false, message: 'orderNo is required' });
      const data = await ownerDashboardService.getOrderJourney(orderNo);
      res.status(200).json({ success: true, data });
    } catch (err) { Logger.error('getOrderJourney', err); next(err); }
  }

  async getStageOrders(req, res, next) {
    try {
      const stage = req.query.stage;
      if (!stage) return res.status(400).json({ success: false, message: 'stage is required' });
      const filters = { depot: req.query.depot || null, order_type: req.query.order_type || null, date_from: req.query.date_from || null, date_to: req.query.date_to || null };
      const data = await ownerDashboardService.getStageOrders(stage, filters);
      res.status(200).json({ success: true, data });
    } catch (err) { Logger.error('getStageOrders', err); next(err); }
  }

  async getOilTypeOrders(req, res, next) {
    try {
      const oilType = req.query.oilType;
      if (!oilType) return res.status(400).json({ success: false, message: 'oilType is required' });
      const filters = { depot: req.query.depot || null, order_type: req.query.order_type || null, date_from: req.query.date_from || null, date_to: req.query.date_to || null };
      const data = await ownerDashboardService.getOilTypeOrders(oilType, filters);
      res.status(200).json({ success: true, data });
    } catch (err) { Logger.error('getOilTypeOrders', err); next(err); }
  }

  async getUserDetail(req, res, next) {
    try {
      const userId = parseInt(req.params.userId);
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Invalid userId' });
      }
      const filters = {
        depot:      req.query.depot      || null,
        order_type: req.query.order_type || null,
        date_from:  req.query.date_from  || null,
        date_to:    req.query.date_to    || null,
      };

      const data = await ownerDashboardService.getUserDetail(userId, filters);

      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      Logger.error('Error in getUserDetail controller', err);
      next(err);
    }
  }
}

module.exports = new OwnerDashboardController();
