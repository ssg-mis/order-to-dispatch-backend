/**
 * Shared master-data list/search against the v2 schema.
 *
 * The reference had five near-identical getAll implementations (one per master
 * table) - this collapses that duplication into one helper. Returns rows in
 * snake_case so the existing frontend, which reads customer_name/depot_name/
 * sku_name/etc., keeps working unchanged; `id` is a real FK now.
 */
const { dbV2 } = require('../config/db-v2.ts');
const { and, eq, or, ilike, asc, sql } = require('drizzle-orm');

function toSnakeCase(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)] = value;
  }
  return out;
}

/**
 * @param table drizzle table (schema.customers, schema.depots, ...)
 * @param opts  { nameColumn, searchColumns, all, page, limit, search }
 *              nameColumn/searchColumns are drizzle (camelCase) column keys.
 * @returns { rows: <snake_case objects>, total }
 */
async function masterLookup(table, { nameColumn, searchColumns, all, page = 1, limit = 20, search = '' }) {
  const isAll = all === true || all === 'true';
  const noLimit = isAll && (limit === undefined || limit === null);

  const conditions = [eq(table.approvalStatus, 'approved')];
  if (!isAll) conditions.push(eq(table.status, 'Active'));
  if (search) {
    conditions.push(or(...searchColumns.map((col) => ilike(table[col], `%${search}%`))));
  }
  const where = and(...conditions);

  const [{ count }] = await dbV2
    .select({ count: sql`count(*)::int` })
    .from(table)
    .where(where);

  let query = dbV2.select().from(table).where(where).orderBy(asc(table[nameColumn]));
  if (!noLimit) {
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 20;
    query = query.limit(l).offset((p - 1) * l);
  }
  const rows = await query;

  return { rows: rows.map(toSnakeCase), total: count };
}

module.exports = { masterLookup };
