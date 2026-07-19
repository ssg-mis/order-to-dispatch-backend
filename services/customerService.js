/**
 * Customer Service — v2 schema.
 * Handles CRUD + approval workflow for the `customers` table. Field names
 * kept as the old `customer_details` external contract (customer_id/
 * customer_name/address_line_1/...) so the (unmigrated) Master frontend page
 * keeps working unchanged — see services/masterCrudHelper.js.
 */
const { schema } = require('../config/db-v2.ts');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.customers;

const FIELD_MAP = {
  customer_id: 'customerCode',
  customer_name: 'customerName',
  status: 'status',
  contact_person: 'contactPerson',
  contact: 'contact',
  email: 'email',
  address_line_1: 'addressLine1',
  address_line_2: 'addressLine2',
  state: 'state',
  pincode: 'pincode',
  pan: 'pan',
  gstin: 'gstin',
  gst_registered: 'gstRegistered',
  // Destination-depot FK for depot-representing customers (Stock Transfer). Auto-
  // resolved by the resolve_customer_depot trigger; exposed here so it round-trips
  // in reads and can be corrected explicitly. Not in EDITABLE_COLUMNS yet (no UI field).
  depot_id: 'depotId',
};

const EDITABLE_COLUMNS = [
  'customer_name', 'contact_person', 'contact', 'email', 'address_line_1',
  'address_line_2', 'state', 'pincode', 'pan', 'gstin', 'gst_registered', 'status',
];

class CustomerService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllCustomers(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'customerName',
        searchColumns: ['customerName', 'customerCode', 'gstin', 'contactPerson', 'contact', 'email'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} customers (total: ${total})`);
      return {
        customers: rows.map((r) => crud.toExternal(r, FIELD_MAP)),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching customers:', error);
      throw error;
    }
  }

  async getPendingCustomers() {
    try {
      const rows = await crud.getPending(TABLE, FIELD_MAP);
      Logger.info(`Fetched ${rows.length} pending customers (creates + edits)`);
      return rows;
    } catch (error) {
      Logger.error('Error fetching pending customers:', error);
      throw error;
    }
  }

  async reviewCustomer(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const result = await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(`Customer ID ${id} ${action}d by user ${reviewedBy}`);
      return result;
    } catch (error) {
      Logger.error(`Error reviewing customer ${id}:`, error);
      throw error;
    }
  }

  async getCustomerById(customerId) {
    try {
      const row = await crud.getById(TABLE, customerId, FIELD_MAP);
      if (row) Logger.info(`Fetched customer details for ID: ${customerId}`);
      return row;
    } catch (error) {
      Logger.error(`Error fetching customer ${customerId}:`, error);
      throw error;
    }
  }

  async getCustomerByName(customerName) {
    try {
      const row = await crud.getByColumn(TABLE, TABLE.customerName, customerName, FIELD_MAP);
      if (row) Logger.info(`Fetched customer details for: ${customerName}`);
      return row;
    } catch (error) {
      Logger.error(`Error fetching customer by name ${customerName}:`, error);
      throw error;
    }
  }

  async createCustomer(data) {
    try {
      const defaults = { status: 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      const row = await crud.createRecord(TABLE, data, FIELD_MAP, { defaults });
      Logger.info(`Created new customer with ID: ${row.id}`);
      return row;
    } catch (error) {
      Logger.error('Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, opts, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Customer ID ${id} edit staged for approval` : `Updated customer ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error updating customer ${id}:`, error);
      throw error;
    }
  }

  async deleteCustomer(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted customer ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting customer ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
