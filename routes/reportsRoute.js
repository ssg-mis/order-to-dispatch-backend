/**
 * Reports Routes
 */
const express = require('express');
const router = express.Router();
const reportsService = require('../services/reportsService');
const { Logger } = require('../utils');

/**
 * GET /api/v1/reports
 * Returns comprehensive report data with filters
 * Query params: order_no, customer_name, oil_type, sku_name, from_date, to_date
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      order_no: req.query.order_no || '',
      customer_name: req.query.customer_name || '',
      oil_type: req.query.oil_type || '',
      sku_name: req.query.sku_name || '',
      from_date: req.query.from_date || '',
      to_date: req.query.to_date || '',
    };
    const data = await reportsService.getReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Reports GET error', err);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

/**
 * GET /api/v1/reports/dispatch-report
 * Returns detailed dispatch rows from lift_receiving_confirmation joined with related tables
 * Query params: from_date, to_date, customer_name, dispatch_no, order_no
 */
router.get('/dispatch-report', async (req, res) => {
  try {
    const filters = {
      from_date:     req.query.from_date     || '',
      to_date:       req.query.to_date       || '',
      customer_name: req.query.customer_name || '',
      dispatch_no:   req.query.dispatch_no   || '',
      order_no:      req.query.order_no      || '',
      limit:         req.query.limit         || '',
    };
    const data = await reportsService.getDispatchReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[DISPATCH REPORT ERROR]', err.message, err.stack);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate dispatch report' });
  }
});

/**
 * GET /api/v1/reports/pending-sauda
 * CP Pending Sauda Report — DOs stuck in the Dispatch Planning stage, grouped by
 * Start-Date month with per-month subtotals and a grand total.
 * Query params: customer_name, order_no
 */
router.get('/pending-sauda', async (req, res) => {
  try {
    const filters = {
      customer_name: req.query.customer_name || '',
      order_no:      req.query.order_no      || '',
    };
    const data = await reportsService.getPendingSaudaReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Pending Sauda report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate pending sauda report' });
  }
});

module.exports = router;
