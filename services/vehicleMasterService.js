/**
 * Vehicle Master Service — v2 schema.
 * Handles CRUD + approval workflow for the `vehicles` table. Field names kept
 * as the old `vehicle_master` external contract (vehicle_master_id/
 * registration_no/...) so the (unmigrated) Master frontend page keeps working
 * unchanged — see services/masterCrudHelper.js. `transporter` (old free-text
 * column) has no v2 equivalent — the real relationship is the `transporter_id`
 * FK; resolveTransporter() accepts either a `transporter_id` or a `transporter`
 * name (the Master page's combobox always sends the name) and resolves it.
 * Two combobox options ("Company Vehicle"/"Party Vehicle") aren't real
 * transporters at all - they're a categorical ownership status, stored in
 * `ownership_type` (transporter_id stays null for these), not a name lookup.
 */
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, sql, inArray } = require('drizzle-orm');
const Logger = require('../utils/logger');
const crud = require('./masterCrudHelper');

const TABLE = schema.vehicles;

const FIELD_MAP = {
  vehicle_master_id: 'vehicleCode',
  status: 'status',
  registration_no: 'registrationNo',
  vehicle_type: 'vehicleType',
  rto: 'rto',
  rc_image: 'rcImage',
  road_tax: 'roadTax',
  road_tax_image: 'roadTaxImage',
  pollution: 'pollution',
  pollution_image: 'pollutionImage',
  insurance: 'insurance',
  insurance_image: 'insuranceImage',
  fitness: 'fitness',
  fitness_image: 'fitnessImage',
  state_permit: 'statePermit',
  state_permit_image: 'statePermitImage',
  state_permit_type: 'statePermitType',
  national_permit: 'nationalPermit',
  national_permit_image: 'nationalPermitImage',
  fuel_type: 'fuelType',
  gvw: 'gvw',
  ulw: 'ulw',
  passing: 'passing',
  life_time_tax: 'lifeTimeTax',
  life_time_tax_image: 'lifeTimeTaxImage',
};

const EDITABLE_COLUMNS = [
  'registration_no', 'vehicle_type', 'transporter', 'transporter_id', 'rto', 'status', 'fuel_type',
  'gvw', 'ulw', 'passing', 'state_permit_type', 'rc_image',
  'road_tax', 'road_tax_image', 'pollution', 'pollution_image',
  'insurance', 'insurance_image', 'fitness', 'fitness_image',
  'state_permit', 'state_permit_image', 'national_permit', 'national_permit_image', 'life_time_tax', 'life_time_tax_image',
];

const OWNERSHIP_SENTINELS = { 'Company Vehicle': 'company', 'Party Vehicle': 'party' };
const OWNERSHIP_LABELS = { company: 'Company Vehicle', party: 'Party Vehicle' };

async function resolveTransporter(patch, data) {
  const sentinel = OWNERSHIP_SENTINELS[data.transporter];
  if (sentinel) {
    patch.ownershipType = sentinel;
    patch.transporterId = null;
    return patch;
  }
  if (data.transporter_id) {
    const n = parseInt(data.transporter_id, 10);
    if (!isNaN(n)) { patch.transporterId = n; patch.ownershipType = null; }
  } else if (data.transporter) {
    const [t] = await dbV2.select({ id: schema.transporters.id }).from(schema.transporters).where(eq(schema.transporters.transporterName, data.transporter));
    if (t) { patch.transporterId = t.id; patch.ownershipType = null; }
  }
  return patch;
}

// The Master page's vehicle list/edit-form reads a `transporter` NAME field
// (its combobox pre-fills from it) - v2 only stores transporter_id (or, for
// the two sentinel options, ownership_type), so batch-resolve the display
// name back onto the external rows before returning them.
async function attachTransporterNames(rows) {
  const ids = [...new Set(rows.map((r) => r.transporter_id).filter(Boolean))];
  let nameById = {};
  if (ids.length) {
    const transporters = await dbV2
      .select({ id: schema.transporters.id, name: schema.transporters.transporterName })
      .from(schema.transporters)
      .where(inArray(schema.transporters.id, ids));
    nameById = Object.fromEntries(transporters.map((t) => [t.id, t.name]));
  }
  return rows.map((r) => ({
    ...r,
    transporter: r.transporter_id ? (nameById[r.transporter_id] || null) : (OWNERSHIP_LABELS[r.ownership_type] || null),
  }));
}

class VehicleMasterService {
  static get EDITABLE_COLUMNS() {
    return EDITABLE_COLUMNS;
  }

  async getAllVehicles(params = {}) {
    try {
      const { masterLookup } = require('./masterLookupHelper');
      const { rows, total } = await masterLookup(TABLE, {
        nameColumn: 'registrationNo',
        searchColumns: ['registrationNo', 'vehicleCode', 'vehicleType'],
        ...params,
      });
      Logger.info(`Fetched ${rows.length} vehicles (total: ${total}, search: "${params.search || ''}")`);
      const external = rows.map((r) => ({ ...crud.toExternal(r, FIELD_MAP), has_pending_edit: r.pendingChanges != null }));
      return {
        vehicles: await attachTransporterNames(external),
        pagination: { total, page: parseInt(params.page) || 1, limit: parseInt(params.limit) || total },
      };
    } catch (error) {
      Logger.error('Error fetching vehicles:', error);
      throw error;
    }
  }

  async getVehicleById(id) {
    try {
      const row = await crud.getById(TABLE, id, FIELD_MAP);
      if (!row) return null;
      const [withName] = await attachTransporterNames([row]);
      return withName;
    } catch (error) {
      Logger.error(`Error fetching vehicle ${id}:`, error);
      throw error;
    }
  }

  async getPendingVehicles() {
    try {
      const rows = await crud.getPending(TABLE, FIELD_MAP);
      return await attachTransporterNames(rows);
    } catch (error) {
      Logger.error('Error fetching pending vehicles:', error);
      throw error;
    }
  }

  async reviewVehicle(id, action, reviewedBy, reason, overrides = {}) {
    try {
      const row = await crud.review(TABLE, id, action, reviewedBy, reason, overrides, EDITABLE_COLUMNS, FIELD_MAP, { beforeWrite: resolveTransporter });
      const [withName] = await attachTransporterNames([row]);
      return withName;
    } catch (error) {
      Logger.error(`Error reviewing vehicle ${id}:`, error);
      throw error;
    }
  }

  async createVehicle(data) {
    try {
      const registrationNo = data.registration_no;
      const defaults = { status: data.status || 'Active', approvalStatus: data.approval_status || 'approved', createdBy: data.created_by ?? null };
      let patch = { ...defaults, ...crud.toColumn(data, FIELD_MAP) };
      patch = await resolveTransporter(patch, data);

      // If a REJECTED record already exists with the same registration_no, reuse
      // it (reset to pending/approved with the new data) instead of inserting -
      // avoids violating the unique constraint on registration_no.
      const [existingRejected] = await dbV2
        .select({ id: TABLE.id })
        .from(TABLE)
        .where(and(sql`UPPER(TRIM(${TABLE.registrationNo})) = UPPER(TRIM(${registrationNo}))`, eq(TABLE.approvalStatus, 'rejected')));

      if (existingRejected) {
        Logger.info(`Re-using rejected vehicle record ${existingRejected.id} for registration_no "${registrationNo}"`);
        const [row] = await dbV2
          .update(TABLE)
          .set({ ...patch, rejectionReason: null, reviewedBy: null, createdAt: new Date() })
          .where(eq(TABLE.id, existingRejected.id))
          .returning();
        const [withName] = await attachTransporterNames([crud.toExternal(row, FIELD_MAP)]);
        return { ...withName, resubmitted: true };
      }

      const [row] = await dbV2.insert(TABLE).values(patch).returning();
      Logger.info(`Created new vehicle with ID: ${row.id}`);
      const [withName] = await attachTransporterNames([crud.toExternal(row, FIELD_MAP)]);
      return withName;
    } catch (error) {
      Logger.error('Error creating vehicle:', error);
      throw error;
    }
  }

  async updateVehicle(id, data, opts = {}) {
    try {
      const row = await crud.updateRecord(TABLE, id, data, { ...opts, beforeWrite: resolveTransporter }, EDITABLE_COLUMNS, FIELD_MAP);
      Logger.info(row.staged ? `Vehicle ID ${id} edit staged for approval` : `Updated vehicle ID: ${id}`);
      const [withName] = await attachTransporterNames([row]);
      return { ...withName, staged: row.staged };
    } catch (error) {
      Logger.error(`Error updating vehicle ${id}:`, error);
      throw error;
    }
  }

  async deleteVehicle(id) {
    try {
      const row = await crud.deleteRecord(TABLE, id);
      Logger.info(`Deleted vehicle ID: ${id}`);
      return row;
    } catch (error) {
      Logger.error(`Error deleting vehicle ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new VehicleMasterService();
