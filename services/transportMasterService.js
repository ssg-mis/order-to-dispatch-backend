/**
 * Transport Master Service — v2 schema.
 * Handles CRUD + approval workflow for the `transporters` table. Field names
 * kept as the old `transport_master` external contract (transport_master_id/
 * transporter_name/...) so the (unmigrated) Master frontend page keeps
 * working unchanged — see services/masterCrudHelper.js.
 */
const { schema } = require('../config/db-v2.ts');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.transporters;

const FIELD_MAP = {
  transport_master_id: 'transporterCode',
  status: 'status',
  transporter_name: 'transporterName',
  contact_person: 'contactPerson',
  contact_number: 'contactNumber',
  email_id: 'emailId',
  address_line1: 'addressLine1',
  state: 'state',
  pincode: 'pincode',
  pan: 'pan',
  gstin: 'gstin',
};

const EDITABLE_COLUMNS = ['transporter_name', 'contact_person', 'contact_number', 'gstin', 'status'];

class TransportMasterService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllTransporters(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'transporterName',
        searchColumns: ['transporterName', 'transporterCode', 'contactPerson', 'contactNumber'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} transporters (total: ${total}, search: "${params.search || ''}")`);
      return {
        transporters: rows.map((r) => ({ ...crud.toExternal(r, FIELD_MAP), has_pending_edit: r.pendingChanges != null })),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching transporters:', error);
      throw error;
    }
  }

  async getTransporterById(id) {
    try {
      return await crud.getById(TABLE, id, FIELD_MAP);
    } catch (error) {
      Logger.error(`Error fetching transporter ${id}:`, error);
      throw error;
    }
  }

  async getPendingTransporters() {
    try {
      return await crud.getPending(TABLE, FIELD_MAP);
    } catch (error) {
      Logger.error('Error fetching pending transporters:', error);
      throw error;
    }
  }

  async reviewTransporter(id, action, reviewedBy, reason, overrides = {}) {
    try {
      return await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP);
    } catch (error) {
      Logger.error(`Error reviewing transporter ${id}:`, error);
      throw error;
    }
  }

  async createTransporter(data) {
    try {
      const defaults = { status: 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults });
      Logger.info(`Created new transporter with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating transporter:', error);
      throw error;
    }
  }

  async updateTransporter(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, opts, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Transporter ID ${id} edit staged for approval` : `Updated transporter ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating transporter ${id}:`, error);
      throw error;
    }
  }

  async deleteTransporter(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted transporter ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting transporter ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new TransportMasterService();
