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

module.exports = {
  getAllSkus,
  getSkuById
};
