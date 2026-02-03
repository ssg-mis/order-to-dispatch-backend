/**
 * SKU Routes
 * API endpoints for SKU operations
 */

const express = require('express');
const router = express.Router();
const skuController = require('../controllers/skuController');

/**
 * @route   GET /api/v1/skus
 * @desc    Get all active SKUs
 * @access  Public
 */
router.get('/', skuController.getAllSkus);

/**
 * @route   GET /api/v1/skus/:id
 * @desc    Get SKU by ID
 * @access  Public
 */
router.get('/:id', skuController.getSkuById);

/**
 * @route   GET /api/v1/skus/rate/:skuName
 * @desc    Get rate by SKU name
 * @access  Public
 */
router.get('/rate/:skuName', skuController.getSkuRate);

module.exports = router;
