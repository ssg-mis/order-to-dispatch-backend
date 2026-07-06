/**
 * Audit User Resolver
 *
 * The stage-tracking audit columns (order_punch_user, pre_approval_user, ...)
 * store numeric login.id values. API consumers expect readable usernames, so
 * services call resolveAuditUsers() on result rows before returning them —
 * it swaps each stored id for the matching login.username in place.
 *
 * Values that are not resolvable ids (legacy usernames, nulls) pass through
 * unchanged, so the helper is safe to run before/after the DB migration.
 */

const db = require('../config/db');

const AUDIT_USER_COLUMNS = [
  // order_dispatch
  'order_punch_user',
  'pre_approval_user',
  'order_approval_user',
  'dispatch_planning_user',
  // lift_receiving_confirmation
  'actual_dispatch_user',
  'material_load_user',
  'security_guard_user',
  'make_invoice_user',
  'check_invoice_user',
  'gate_out_user',
  'material_receipt_user',
  'damage_adjustment_user',
];

/**
 * Replace login ids with usernames on the audit columns of the given rows.
 * Mutates and returns the same array. One batched lookup per call.
 * @param {Object[]} rows
 * @returns {Promise<Object[]>}
 */
async function resolveAuditUsers(rows) {
  if (!rows || rows.length === 0) return rows;

  const ids = new Set();
  for (const row of rows) {
    for (const col of AUDIT_USER_COLUMNS) {
      const val = row?.[col];
      if (val !== null && val !== undefined && /^\d+$/.test(String(val))) {
        ids.add(Number(val));
      }
    }
  }
  if (ids.size === 0) return rows;

  const result = await db.query(
    'SELECT id, username FROM login WHERE id = ANY($1)',
    [[...ids]]
  );
  const nameById = new Map(result.rows.map(r => [r.id, r.username]));

  for (const row of rows) {
    for (const col of AUDIT_USER_COLUMNS) {
      const val = row?.[col];
      if (val !== null && val !== undefined && /^\d+$/.test(String(val))) {
        const name = nameById.get(Number(val));
        if (name) row[col] = name;
      }
    }
  }
  return rows;
}

module.exports = { resolveAuditUsers, AUDIT_USER_COLUMNS };
