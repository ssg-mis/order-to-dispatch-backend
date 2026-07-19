/**
 * Shared master-data CRUD + approval-workflow engine (v2 schema).
 *
 * Every master table (customers, depots, brokers, salespersons, vehicles,
 * drivers, transporters) shares the exact same create/edit-approval shape:
 * a brand-new row starts `approval_status='pending'`; an edit to an already-
 * approved row is staged into `pending_changes` instead of touching the live
 * row; an admin then approves/rejects via review(). This collapses the ~7
 * near-identical raw-SQL copies (against the OLD `login`-adjacent RDS tables)
 * into one engine against the v2 Drizzle tables (see `approvalColumns()` in
 * order-to-dispatch-db-v2/src/schema/_shared.ts).
 *
 * Field-name compatibility: the old raw-SQL services used the old schema's
 * external field names (e.g. `depot_id`, `salesman_name`) which sometimes
 * differ from a plain snake_case of the new Drizzle column (e.g. `depotCode`,
 * `brokerName`). Each per-master service supplies a `fieldMap` (external key
 * -> drizzle column key) so this engine can keep accepting/returning the SAME
 * field names the (unmigrated) Master frontend page already sends/expects -
 * no frontend changes required.
 */
const { dbV2 } = require('../config/db-v2.ts');
const { schema } = require('../config/db-v2.ts');
const { eq, and, or, isNotNull, inArray } = require('drizzle-orm');
const { toSnakeCase } = require('./masterLookupHelper');

function toColumn(data, fieldMap) {
  const patch = {};
  for (const [ext, col] of Object.entries(fieldMap)) {
    if (data[ext] !== undefined) patch[col] = data[ext];
  }
  return patch;
}

// Rewrites a (Drizzle-camelCase-or-already-snake_case) row to the external
// field names the old frontend expects, via fieldMap. Idempotent on an
// already-snake row (toSnakeCase is a no-op when there's nothing to convert).
function toExternal(row, fieldMap) {
  if (!row) return row;
  const snake = toSnakeCase(row);
  const out = { ...snake };
  for (const [ext, col] of Object.entries(fieldMap)) {
    const plainSnake = col.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
    if (plainSnake === ext) continue;
    if (Object.prototype.hasOwnProperty.call(out, plainSnake)) {
      out[ext] = out[plainSnake];
      delete out[plainSnake];
    }
  }
  return out;
}

async function getById(table, id, fieldMap) {
  const [row] = await dbV2.select().from(table).where(eq(table.id, id));
  return row ? toExternal(row, fieldMap) : null;
}

async function getByColumn(table, column, value, fieldMap) {
  const [row] = await dbV2.select().from(table).where(eq(column, value));
  return row ? toExternal(row, fieldMap) : null;
}

async function getPending(table, fieldMap) {
  const rows = await dbV2
    .select()
    .from(table)
    .where(or(eq(table.approvalStatus, 'pending'), isNotNull(table.pendingChanges)));

  const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.pendingEditBy]).filter(Boolean))];
  let usernameById = {};
  if (userIds.length) {
    const users = await dbV2
      .select({ id: schema.users.id, username: schema.users.username })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
    usernameById = Object.fromEntries(users.map((u) => [u.id, u.username]));
  }

  return rows
    .slice()
    .sort((a, b) => new Date(a.pendingEditAt || a.createdAt) - new Date(b.pendingEditAt || b.createdAt))
    .map((r) => ({
      ...toExternal(r, fieldMap),
      request_type: r.approvalStatus === 'pending' ? 'create' : 'edit',
      created_by_name: usernameById[r.createdBy] || null,
      pending_edit_by_name: usernameById[r.pendingEditBy] || null,
    }));
}

/**
 * @param opts.beforeWrite  async (patch, rawExternalData) => patch  - resolves
 *        special fields (e.g. a free-text name into a real FK id) before the
 *        row is inserted/updated. Runs AFTER the plain fieldMap mapping.
 * @param opts.defaults     plain column-keyed defaults merged in before beforeWrite (create only)
 */
async function createRecord(table, data, fieldMap, opts = {}) {
  const { beforeWrite, defaults = {} } = opts;
  let patch = { ...defaults, ...toColumn(data, fieldMap) };
  if (beforeWrite) patch = await beforeWrite(patch, data);
  const [row] = await dbV2.insert(table).values(patch).returning();
  return toExternal(row, fieldMap);
}

async function review(table, id, action, reviewedBy, reason, overrides, editableKeys, fieldMap, opts = {}) {
  const { beforeWrite } = opts;
  const [existing] = await dbV2
    .select({ approvalStatus: table.approvalStatus, pendingChanges: table.pendingChanges })
    .from(table)
    .where(eq(table.id, id));
  if (!existing) throw new Error(`Record ${id} not found`);
  const isEdit = existing.pendingChanges != null && existing.approvalStatus === 'approved';

  if (isEdit) {
    if (action === 'approve') {
      const safeOverrides = Object.fromEntries(Object.entries(overrides).filter(([k]) => editableKeys.includes(k)));
      const merged = { ...existing.pendingChanges, ...safeOverrides };
      const safeExternal = Object.fromEntries(Object.entries(merged).filter(([k]) => editableKeys.includes(k)));
      let patch = toColumn(safeExternal, fieldMap);
      if (beforeWrite) patch = await beforeWrite(patch, safeExternal);
      const [row] = await dbV2
        .update(table)
        .set({ ...patch, reviewedBy, pendingChanges: null, pendingEditBy: null, pendingEditAt: null, rejectionReason: null })
        .where(eq(table.id, id))
        .returning();
      return toExternal(row, fieldMap);
    }
    const [row] = await dbV2
      .update(table)
      .set({ pendingChanges: null, pendingEditBy: null, pendingEditAt: null, rejectionReason: reason || null, reviewedBy })
      .where(eq(table.id, id))
      .returning();
    return toExternal(row, fieldMap);
  }

  // Brand-new create awaiting approval.
  const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
  const safeExternal = action === 'approve'
    ? Object.fromEntries(Object.entries(overrides).filter(([k]) => editableKeys.includes(k)))
    : {};
  let patch = toColumn(safeExternal, fieldMap);
  if (action === 'approve' && beforeWrite) patch = await beforeWrite(patch, safeExternal);
  const [row] = await dbV2
    .update(table)
    .set({ ...patch, approvalStatus, reviewedBy, rejectionReason: reason || null })
    .where(and(eq(table.id, id), eq(table.approvalStatus, 'pending')))
    .returning();
  if (!row) throw new Error(`Pending record ${id} not found`);
  return toExternal(row, fieldMap);
}

async function updateRecord(table, id, data, opts, editableKeys, fieldMap) {
  const { isAdmin = true, userId = null, beforeWrite } = opts;

  if (!isAdmin) {
    const staged = Object.fromEntries(Object.entries(data).filter(([k]) => editableKeys.includes(k)));
    const [row] = await dbV2
      .update(table)
      .set({ pendingChanges: staged, pendingEditBy: userId, pendingEditAt: new Date() })
      .where(and(eq(table.id, id), eq(table.approvalStatus, 'approved')))
      .returning();
    if (!row) throw new Error(`Approved record ${id} not found (cannot stage edit)`);
    return { ...toExternal(row, fieldMap), staged: true };
  }

  let patch = toColumn(data, fieldMap);
  if (beforeWrite) patch = await beforeWrite(patch, data);
  const [row] = await dbV2.update(table).set(patch).where(eq(table.id, id)).returning();
  if (!row) throw new Error(`Record ${id} not found`);
  return toExternal(row, fieldMap);
}

async function deleteRecord(table, id) {
  const [row] = await dbV2.delete(table).where(eq(table.id, id)).returning();
  if (!row) throw new Error(`Record ${id} not found`);
  return row;
}

module.exports = {
  toColumn,
  toExternal,
  getById,
  getByColumn,
  getPending,
  createRecord,
  review,
  updateRecord,
  deleteRecord,
};
