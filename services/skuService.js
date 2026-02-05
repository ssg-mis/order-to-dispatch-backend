/**
 * SKU Service
 * Handles operations for sku_details table
 */

const pool = require('../config/db');
const Logger = require('../utils/logger');

class SkuService {
  /**
   * Get all active SKUs
   */
  async getAllSkus() {
    try {
      const query = `
        SELECT 
          id,
          sku_code,
          sku_name,
          status,
          main_uom,
          alternate_uom,
          nos_per_main_uom,
          units,
          oil_filling_per_unit,
          filling_units,
          converted_kg,
          packing_weight_per_main_unit,
          weight_difference,
          sku_weight,
          packing_weight,
          gross_weight
        FROM sku_details
        WHERE status = 'Active' OR sku_code = 'Active' OR status IS NULL
        ORDER BY sku_name ASC
      `;
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} active SKUs`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching SKUs:', error);
      throw error;
    }
  }

  /**
   * Get SKU by ID
   */
  async getSkuById(id) {
    try {
      const query = `
        SELECT *
        FROM sku_details
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error fetching SKU ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get rate by SKU name
   */
  async getRateBySku(skuName) {
    try {
      const query = `
        SELECT rate
        FROM sku_rate
        WHERE sku = $1
      `;
      
      const result = await pool.query(query, [skuName]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].rate;
    } catch (error) {
      Logger.error(`Error fetching rate for SKU ${skuName}:`, error);
      throw error;
    }
  }

  /**
   * Get all SKU rates with formulas
   */
  async getAllSkuRates() {
    try {
      const query = `
        SELECT 
          id,
          sku,
          rate,
          formula
        FROM sku_rate
        ORDER BY id ASC
      `;
      
      const result = await pool.query(query);
      Logger.info(`Fetched ${result.rows.length} SKU rates`);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching SKU rates:', error);
      throw error;
    }
  }
}

module.exports = new SkuService();
