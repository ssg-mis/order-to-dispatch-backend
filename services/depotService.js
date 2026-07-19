/**
 * Depot Service — v2 schema.
 * Handles CRUD + approval workflow for the `depots` table. Field names kept
 * as the old `depot_details` external contract (depot_id/depot_name/...) so
 * the (unmigrated) Master frontend page keeps working unchanged — see
 * services/masterCrudHelper.js. `salesman_broker_name` was a v1-only
 * denormalized column deliberately dropped in the v2 schema (the real
 * relationship is brokers.depot_id) — silently ignored here, not editable.
 */
const { schema } = require('../config/db-v2.ts');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.depots;

const FIELD_MAP = {
  depot_id: 'depotCode',
  depot_name: 'depotName',
  status: 'status',
  depot_address: 'depotAddress',
  state: 'state',
};

const EDITABLE_COLUMNS = ['depot_name', 'depot_address', 'state', 'status'];

class DepotService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllDepots(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'depotName',
        searchColumns: ['depotName', 'depotCode', 'state', 'depotAddress'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} depots (total: ${total})`);
      return {
        depots: rows.map((r) => crud.toExternal(r, FIELD_MAP)),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching depots:', error);
      throw error;
    }
  }

  async getPendingDepots() {
    try {
      const rows = await crud.getPending(TABLE, FIELD_MAP);
      Logger.info(`Fetched ${rows.length} pending depots (creates + edits)`);
      return rows;
    } catch (error) {
      Logger.error('Error fetching pending depots:', error);
      throw error;
    }
  }

  async reviewDepot(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const result = await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(`Depot ${id} ${action}d by user ${reviewedBy}`);
      return result;
    } catch (error) {
      Logger.error(`Error reviewing depot ${id}:`, error);
      throw error;
    }
  }

  async getDepotById(depotId) {
    try {
      const row = await crud.getById(TABLE, depotId, FIELD_MAP);
      if (row) Logger.info(`Fetched depot details for ID: ${depotId}`);
      return row;
    } catch (error) {
      Logger.error(`Error fetching depot ${depotId}:`, error);
      throw error;
    }
  }

  async getDepotByName(depotName) {
    try {
      const row = await crud.getByColumn(TABLE, TABLE.depotName, depotName, FIELD_MAP);
      if (row) Logger.info(`Fetched depot details for: ${depotName}`);
      return row;
    } catch (error) {
      Logger.error(`Error fetching depot by name ${depotName}:`, error);
      throw error;
    }
  }

  async createDepot(data) {
    try {
      const defaults = { status: 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults });
      Logger.info(`Created new depot with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating depot:', error);
      throw error;
    }
  }

  async updateDepot(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, opts, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Depot ID ${id} edit staged for approval` : `Updated depot ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating depot ${id}:`, error);
      throw error;
    }
  }

  async deleteDepot(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted depot ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting depot ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DepotService();
