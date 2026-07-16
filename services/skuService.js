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
  // v2 schema: delegate to the shared master-lookup helper. Response key stays
  // `skuDetails` (what the frontend reads).
  async getAllSkus(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { schema } = require('../config/db-v2.ts');
      const { rows, total } = await masterLookup(schema.skus, {
        nameColumn: 'skuName',
        searchColumns: ['skuName', 'skuCode'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} SKUs (total: ${total})`);
      return { skuDetails: rows, pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total } };
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
