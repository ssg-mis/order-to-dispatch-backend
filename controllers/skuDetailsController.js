/**
 * SKU Details Controller — v2 schema.
 * Thin HTTP layer over services/skuDetailsService.js (was raw-SQL against the
 * production RDS `sku_details` + `tag` tables). Request/response shapes are
 * unchanged so the Master page's SKU tab + the gate-in/production SKU-weight
 * lookups keep working as-is.
 */

const skuDetailsService = require('../services/skuDetailsService');
const { Logger } = require('../utils');

const isAdminUser = (req) => req.user?.role === 'admin' || req.user?.role === 'super_admin';

const getAllSkuDetails = async (req, res, next) => {
  try {
    const result = await skuDetailsService.getAllSkuDetails(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getSkuDetailById = async (req, res, next) => {
  try {
    const sku = await skuDetailsService.getSkuDetailById(req.params.id);
    if (!sku) {
      return res.status(404).json({ success: false, message: 'SKU Detail not found' });
    }
    res.json({ success: true, data: sku });
  } catch (error) {
    next(error);
  }
};

const createSkuDetail = async (req, res, next) => {
  try {
    if (!req.body.sku_code || !req.body.sku_name) {
      return res.status(400).json({ success: false, message: 'Please provide SKU Code and SKU Name' });
    }
    const isAdmin = isAdminUser(req);
    const data = {
      ...req.body,
      approval_status: isAdmin ? 'approved' : 'pending',
      created_by: req.user?.id || null,
    };
    const sku = await skuDetailsService.createSkuDetail(data);
    res.status(201).json({
      success: true,
      message: isAdmin ? 'SKU Detail created successfully' : 'SKU Detail submitted for approval',
      data: sku,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const updateSkuDetail = async (req, res, next) => {
  try {
    const isAdmin = isAdminUser(req);
    const sku = await skuDetailsService.updateSkuDetail(req.params.id, req.body, {
      isAdmin,
      userId: req.user?.id || null,
    });
    res.json({
      success: true,
      message: isAdmin ? 'SKU updated successfully' : 'Edit submitted for approval',
      data: sku,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const deleteSkuDetail = async (req, res, next) => {
  try {
    await skuDetailsService.deleteSkuDetail(req.params.id);
    res.json({ success: true, message: 'SKU Detail deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getPendingSkuDetails = async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const rows = await skuDetailsService.getPendingSkuDetails();
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const reviewSkuDetail = async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    const { action, reason, ...overrides } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const sku = await skuDetailsService.reviewSkuDetail(id, action, req.user.id, reason, overrides);
    res.json({ success: true, message: `SKU Detail ${action}d successfully`, data: sku });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllSkuDetails,
  getSkuDetailById,
  createSkuDetail,
  updateSkuDetail,
  deleteSkuDetail,
  getPendingSkuDetails,
  reviewSkuDetail,
};
