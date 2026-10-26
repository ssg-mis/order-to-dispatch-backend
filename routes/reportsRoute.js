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
 * Query params: customer_name, order_no, depo_name (blank = all depots)
 */
router.get('/pending-sauda', async (req, res) => {
  try {
    const filters = {
      customer_name: req.query.customer_name || '',
      order_no:      req.query.order_no      || '',
      depo_name:     req.query.depo_name     || '',
    };
    const data = await reportsService.getPendingSaudaReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Pending Sauda report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate pending sauda report' });
  }
});

/**
 * GET /api/v1/reports/pending-sauda-customer
 * Customer-Wise CP Pending Sauda Report (Summary) — pending DOs grouped by
 * Customer -> Sauda -> Oil type. Optional query param: customer_name.
 */
router.get('/pending-sauda-customer', async (req, res) => {
  try {
    const filters = { customer_name: req.query.customer_name || '' };
    const data = await reportsService.getPendingSaudaCustomerReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Customer-wise Pending Sauda report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate customer-wise pending sauda report' });
  }
});

/**
 * GET /api/v1/reports/pending-sauda-detailed
 * Customer-Wise CP Pending Sauda Report (Detailed) — pending DOs with item-level
 * billing detail, one column per invoice. Optional query param: customer_name.
 */
router.get('/pending-sauda-detailed', async (req, res) => {
  try {
    const filters = { customer_name: req.query.customer_name || '' };
    const data = await reportsService.getPendingSaudaDetailedReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Customer-wise Detailed Pending Sauda report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate detailed pending sauda report' });
  }
});

/**
 * GET /api/v1/reports/pending-sauda-sku
 * SKU & Customer-Wise CP Pending Sauda Report — pending DOs grouped by Customer -> DO,
 * one row per ordered SKU. Optional query param: customer_name.
 */
router.get('/pending-sauda-sku', async (req, res) => {
  try {
    const filters = { customer_name: req.query.customer_name || '' };
    const data = await reportsService.getPendingSaudaSkuReport(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('SKU & Customer-wise Pending Sauda report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate SKU & customer-wise pending sauda report' });
  }
});

/**
 * GET /api/v1/reports/oil-dispatch-voucher
 * Oil Dispatch Voucher — one voucher per pending DO. Optional query param: order_no.
 */
router.get('/oil-dispatch-voucher', async (req, res) => {
  try {
    const filters = { order_no: req.query.order_no || '' };
    const data = await reportsService.getOilDispatchVoucher(filters);
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Oil Dispatch Voucher report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate oil dispatch voucher' });
  }
});

/**
 * GET /api/v1/reports/daily-dispatch
 * Daily CP Dispatch Report — all invoiced dispatches for a Doc Date. Query param: date (YYYY-MM-DD).
 */
router.get('/daily-dispatch', async (req, res) => {
  try {
    const data = await reportsService.getDailyDispatchReport({ date: req.query.date || '' });
    res.json({ success: true, data });
  } catch (err) {
    Logger.error('Daily CP Dispatch report error', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate daily dispatch report' });
  }
});

module.exports = router;
