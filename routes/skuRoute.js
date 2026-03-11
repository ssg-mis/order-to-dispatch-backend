/**
 * SKU Routes
 * API endpoints for SKU operations
 */

const express = require('express');
const router = express.Router();
const skuController = require('../controllers/skuController');
const { skuSellingPriceController, updateSkuSellingPriceController } = require("../controllers/skuSellingPrice");

/**
 * @route GET /api/v1/skus
 * @desc Get all sku selling price details
 */

router.get("/sku-selling-price", skuSellingPriceController);

/**
 * @route PUT /api/v1/skus/sku-selling-price/:id
 * @desc Update a sku selling price directly
 */
router.put("/sku-selling-price/:id", updateSkuSellingPriceController);

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

/**
 * @route   GET /api/v1/skus/rates/all
 * @desc    Get all SKU rates with formulas
 * @access  Public
 */
router.get('/rates/all', skuController.getAllSkuRates);

module.exports = router;
