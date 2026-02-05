/**
 * SKU Controller
 * Handles HTTP requests for SKU operations
 */

const skuService = require('../services/skuService');
const Logger = require('../utils/logger');

/**
 * Get all active SKUs
 */
async function getAllSkus(req, res) {
  try {
    const skus = await skuService.getAllSkus();
    
    res.status(200).json({
      success: true,
      data: skus,
      count: skus.length
    });
  } catch (error) {
    Logger.error('Error in getAllSkus controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKUs',
      error: error.message
    });
  }
}

/**
 * Get SKU by ID
 */
async function getSkuById(req, res) {
  try {
    const { id } = req.params;
    
    const sku = await skuService.getSkuById(id);
    
    if (!sku) {
      return res.status(404).json({
        success: false,
        message: `SKU with ID ${id} not found`
      });
    }
    
    res.status(200).json({
      success: true,
      data: sku
    });
  } catch (error) {
    Logger.error('Error in getSkuById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU',
      error: error.message
    });
  }
}

/**
 * Get rate by SKU name
 */
async function getSkuRate(req, res) {
  try {
    const { skuName } = req.params;
    
    const rate = await skuService.getRateBySku(skuName);
    
    if (rate === null) {
      return res.status(404).json({
        success: false,
        message: `Rate not found for SKU: ${skuName}`
      });
    }
    
    res.status(200).json({
      success: true,
      rate: parseFloat(rate)
    });
  } catch (error) {
    Logger.error('Error in getSkuRate controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU rate',
      error: error.message
    });
  }
}

/**
 * Get all SKU rates with formulas
 */
async function getAllSkuRates(req, res) {
  try {
    const skuRates = await skuService.getAllSkuRates();
    
    res.status(200).json({
      success: true,
      data: skuRates,
      count: skuRates.length
    });
  } catch (error) {
    Logger.error('Error in getAllSkuRates controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU rates',
      error: error.message
    });
  }
}

module.exports = {
  getAllSkus,
  getSkuById,
  getSkuRate,
  getAllSkuRates
};
