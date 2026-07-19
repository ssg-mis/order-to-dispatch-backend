/**
 * SKU Details Service — v2 schema (master CRUD + approval workflow).
 *
 * Backs /api/v1/sku-details (the Master page's SKU tab + the SKU-weight lookup
 * maps on gate-in/production). Operates on the v2 `skus` table via the shared
 * masterCrudHelper — same create/edit-approval shape as the other 6 masters.
 *
 * Was `controllers/skuDetailsController.js` raw-SQL against the production RDS
 * `sku_details` table + a separate `tag` join table. In v2 the tag is a plain
 * `skus.tagName` column (already backfilled — see the schema-model memory), so
 * all the tag-table upsert/delete bookkeeping is gone.
 */
const { schema } = require('../config/db-v2.ts');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');
const { masterLookup } = require('./masterLookupHelper');

const TABLE = schema.skus;

// The old sku_details external field names are the plain snake_case of the v2
// columns, so this map is effectively identity — but masterCrudHelper's
// toColumn only writes keys listed here, so every writable column must appear.
// `hsn_code`/`gst_rate` from the reference's EDITABLE_COLUMNS are intentionally
// absent: they exist in neither the v2 schema nor the frontend SKU form.
const FIELD_MAP = {
  status: 'status',
  sku_code: 'skuCode',
  sku_name: 'skuName',
  main_uom: 'mainUom',
  alternate_uom: 'alternateUom',
  nos_per_main_uom: 'nosPerMainUom',
  units: 'units',
  oil_filling_per_unit: 'oilFillingPerUnit',
  filling_units: 'fillingUnits',
  converted_kg: 'convertedKg',
  packing_weight_per_main_unit: 'packingWeightPerMainUnit',
  weight_difference: 'weightDifference',
  sku_weight: 'skuWeight',
  packing_weight: 'packingWeight',
  gross_weight: 'grossWeight',
  tag_name: 'tagName',
};

// Every business column is editable/stageable — matches the frontend SKU form
// and the other 6 masters. (The reference limited this to 4 columns, silently
// dropping non-admin edits to the weight fields — an oversight, not ported.)
const EDITABLE_COLUMNS = Object.keys(FIELD_MAP);

class SkuDetailsService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllSkuDetails(params = {}) {
    try {
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'skuName',
        searchColumns: ['skuName', 'skuCode'],
        ...params,
      });
      // Re-add the derived flag the old getAll exposed (pending_changes is a
      // real column on the row, so it survives the masterLookup select).
      const skuDetails = rows.map((r) => ({
        ...r,
        has_pending_edit: r.pending_changes != null,
      }));
      Logger.info(`Fetched ${skuDetails.length} SKU details (total: ${total})`);
      return {
        skuDetails,
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching SKU details:', error);
      throw error;
    }
  }

  async getSkuDetailById(id) {
    try {
      const row = await crud.getById(TABLE, id, FIELD_MAP);
      if (row) Logger.info(`Fetched SKU detail for ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error fetching SKU detail ${id}:`, error);
      throw error;
    }
  }

  async getPendingSkuDetails() {
    try {
      const rows = await crud.getPending(TABLE, FIELD_MAP);
      Logger.info(`Fetched ${rows.length} pending SKU details (creates + edits)`);
      return rows;
    } catch (error) {
      Logger.error('Error fetching pending SKU details:', error);
      throw error;
    }
  }

  async createSkuDetail(data) {
    try {
      // Friendly duplicate check (v2 has a UNIQUE constraint on sku_code, but
      // the reference returned a clean 400 rather than a raw constraint error).
      if (data.sku_code) {
        const existing = await crud.getByColumn(TABLE, TABLE.skuCode, data.sku_code, FIELD_MAP);
        if (existing) { const e = new Error('SKU Code already exists'); e.statusCode = 400; throw e; }
      }
      const defaults = {
        status: 'Active',
        approvalStatus: data.approval_status || 'approved',
        createdBy: data.created_by ?? null,
      };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults });
      Logger.info(`Created new SKU detail with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating SKU detail:', error);
      throw error;
    }
  }

  async updateSkuDetail(id, data, opts = {}) {
    try {
      if (data.sku_code) {
        const existing = await crud.getByColumn(TABLE, TABLE.skuCode, data.sku_code, FIELD_MAP);
        if (existing && String(existing.id) !== String(id)) {
          const e = new Error('SKU Code already exists'); e.statusCode = 400; throw e;
        }
      }
      const row = await crud.updateRecord(TABLE, id, data, opts, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `SKU detail ID ${id} edit staged for approval` : `Updated SKU detail ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating SKU detail ${id}:`, error);
      throw error;
    }
  }

  async deleteSkuDetail(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted SKU detail ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting SKU detail ${id}:`, error);
      throw error;
    }
  }

  async reviewSkuDetail(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const result = await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(`SKU detail ID ${id} ${action}d by user ${reviewedBy}`);
      return result;
    } catch (error) {
      Logger.error(`Error reviewing SKU detail ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new SkuDetailsService();
