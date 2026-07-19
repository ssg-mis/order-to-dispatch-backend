/**
 * Salesperson Service — v2 schema.
 * Handles CRUD + approval workflow for the `salespersons` table. Field names
 * kept as the old `salesperson_details` external contract (broker_id/
 * salesman_name/...) so the (unmigrated) Master frontend page keeps working
 * unchanged — see services/masterCrudHelper.js. Depot resolution mirrors
 * brokerService (depot_id direct or depot_name lookup -> depotId).
 */
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq } = require('drizzle-orm');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.salespersons;

const FIELD_MAP = {
  broker_id: 'salespersonCode',
  salesman_name: 'salespersonName',
  status: 'status',
  email_id: 'emailId',
  mobile_no: 'mobileNo',
};

const EDITABLE_COLUMNS = ['salesman_name', 'mobile_no', 'email_id', 'depot_id', 'depot_name', 'status'];

async function resolveDepot(patch, data) {
  if (data.depot_id) {
    const n = parseInt(data.depot_id, 10);
    if (!isNaN(n)) patch.depotId = n;
  } else if (data.depot_name) {
    const [d] = await dbV2.select({ id: schema.depots.id }).from(schema.depots).where(eq(schema.depots.depotName, data.depot_name));
    if (d) patch.depotId = d.id;
  }
  return patch;
}

class SalespersonService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllSalespersons(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'salespersonName',
        searchColumns: ['salespersonName', 'salespersonCode', 'mobileNo', 'emailId'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} salespersons (total: ${total})`);
      return {
        salespersons: rows.map((r) => crud.toExternal(r, FIELD_MAP)),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching salespersons:', error);
      throw error;
    }
  }

  async getSalespersonById(brokerId) {
    try {
      return await crud.getById(TABLE, brokerId, FIELD_MAP);
    } catch (error) {
      Logger.error(`Error fetching salesperson ${brokerId}:`, error);
      throw error;
    }
  }

  async getPendingSalespersons() {
    try {
      return await crud.getPending(TABLE, FIELD_MAP);
    } catch (error) {
      Logger.error('Error fetching pending salespersons:', error);
      throw error;
    }
  }

  async reviewSalesperson(id, action, reviewedBy, reason, overrides = {}) {
    try {
      return await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP, { beforeWrite: resolveDepot });
    } catch (error) {
      Logger.error(`Error reviewing salesperson ${id}:`, error);
      throw error;
    }
  }

  async createSalesperson(data) {
    try {
      const defaults = { status: 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults, beforeWrite: resolveDepot });
      Logger.info(`Created new salesperson with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating salesperson:', error);
      throw error;
    }
  }

  async updateSalesperson(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, { ...opts, beforeWrite: resolveDepot }, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Salesperson ID ${id} edit staged for approval` : `Updated salesperson ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating salesperson ${id}:`, error);
      throw error;
    }
  }

  async deleteSalesperson(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted salesperson ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting salesperson ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new SalespersonService();
