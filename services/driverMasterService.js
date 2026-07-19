/**
 * Driver Master Service — v2 schema.
 * Handles CRUD + approval workflow for the `drivers` table. Field names kept
 * as the old `driver_master` external contract (driver_master_id/driver_name/
 * address_line1/...) so the (unmigrated) Master frontend page keeps working
 * unchanged — see services/masterCrudHelper.js.
 */
const { schema } = require('../config/db-v2.ts');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.drivers;

const FIELD_MAP = {
  driver_master_id: 'driverCode',
  status: 'status',
  driving_licence_no: 'drivingLicenceNo',
  driving_licence_type: 'drivingLicenceType',
  valid_upto: 'validUpto',
  rto: 'rto',
  driver_name: 'driverName',
  mobile_no: 'mobileNo',
  email_id: 'emailId',
  address_line1: 'addressLine1',
  state: 'state',
  pincode: 'pincode',
  aadhaar_no: 'aadhaarNo',
  pan_no: 'panNo',
  aadhaar_upload: 'aadhaarUpload',
  dl_upload: 'dlUpload',
};

const EDITABLE_COLUMNS = ['driver_name', 'mobile_no', 'driving_licence_no', 'driving_licence_type', 'valid_upto', 'rto', 'status'];

class DriverMasterService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllDrivers(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'driverName',
        searchColumns: ['driverName', 'driverCode', 'mobileNo', 'drivingLicenceNo'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} drivers (total: ${total}, search: "${params.search || ''}")`);
      return {
        drivers: rows.map((r) => ({ ...crud.toExternal(r, FIELD_MAP), has_pending_edit: r.pendingChanges != null })),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching drivers:', error);
      throw error;
    }
  }

  async getDriverById(id) {
    try {
      return await crud.getById(TABLE, id, FIELD_MAP);
    } catch (error) {
      Logger.error(`Error fetching driver ${id}:`, error);
      throw error;
    }
  }

  async getPendingDrivers() {
    try {
      return await crud.getPending(TABLE, FIELD_MAP);
    } catch (error) {
      Logger.error('Error fetching pending drivers:', error);
      throw error;
    }
  }

  async reviewDriver(id, action, reviewedBy, reason, overrides = {}) {
    try {
      return await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP);
    } catch (error) {
      Logger.error(`Error reviewing driver ${id}:`, error);
      throw error;
    }
  }

  async createDriver(data) {
    try {
      const defaults = { status: 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults });
      Logger.info(`Created new driver with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating driver:', error);
      throw error;
    }
  }

  async updateDriver(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, opts, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Driver ID ${id} edit staged for approval` : `Updated driver ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating driver ${id}:`, error);
      throw error;
    }
  }

  async deleteDriver(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted driver ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting driver ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new DriverMasterService();
