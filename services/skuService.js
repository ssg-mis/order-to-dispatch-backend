/**
 * SKU Service
 * Handles operations for sku_details table
 */

const Logger = require('../utils/logger');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq } = require('drizzle-orm');
const { toSnakeCase } = require('./masterLookupHelper');

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
   * Get SKU by ID (v2 `skus`; snake_case out, matching the old sku_details row)
   */
  async getSkuById(id) {
    try {
      const [row] = await dbV2.select().from(schema.skus).where(eq(schema.skus.id, id));
      return row ? toSnakeCase(row) : null;
    } catch (error) {
      Logger.error(`Error fetching SKU ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get rate by SKU name (v2 `sku_rate`)
   */
  async getRateBySku(skuName) {
    try {
      const [row] = await dbV2
        .select({ rate: schema.skuRates.rate })
        .from(schema.skuRates)
        .where(eq(schema.skuRates.sku, skuName));
      return row ? row.rate : null;
    } catch (error) {
      Logger.error(`Error fetching rate for SKU ${skuName}:`, error);
      throw error;
    }
  }

  /**
   * Get all SKU rates with formulas (v2 `sku_rate`)
   */
  async getAllSkuRates() {
    try {
      const rows = await dbV2
        .select({ id: schema.skuRates.id, sku: schema.skuRates.sku, rate: schema.skuRates.rate, formula: schema.skuRates.formula })
        .from(schema.skuRates)
        .orderBy(schema.skuRates.id);
      Logger.info(`Fetched ${rows.length} SKU rates`);
      return rows;
    } catch (error) {
      Logger.error('Error fetching SKU rates:', error);
      throw error;
    }
  }
}

module.exports = new SkuService();
