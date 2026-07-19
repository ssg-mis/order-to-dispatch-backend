/**
 * Production Service — v2 schema.
 * Daily per-SKU plant output (the Production screen). Was raw SQL against the
 * old RDS `production` table (created on the fly via ensureTable); that table is
 * now a real v2 table (schema.production, backfilled from staging), so the
 * ensureTable bootstrap is gone.
 */
const { dbV2, schema } = require('../config/db-v2.ts');
const { and, eq, gte, lte, gt, asc, sql } = require('drizzle-orm');

class ProductionService {
  async getByDate(date) {
    return dbV2
      .select({ id: schema.production.id, sku_name: schema.production.skuName, date: schema.production.date, qty: schema.production.qty })
      .from(schema.production)
      .where(eq(schema.production.date, date))
      .orderBy(asc(schema.production.skuName));
  }

  async getByRange(from, to) {
    return dbV2
      .select({
        sku_name: schema.production.skuName,
        date: sql`to_char(${schema.production.date}, 'YYYY-MM-DD')`.as('date'),
        qty: schema.production.qty,
      })
      .from(schema.production)
      .where(and(gte(schema.production.date, from), lte(schema.production.date, to), gt(schema.production.qty, 0)))
      .orderBy(asc(schema.production.skuName), asc(schema.production.date));
  }

  async bulkUpsert(date, items) {
    if (!items || items.length === 0) return [];
    const out = [];
    for (const { sku_name, qty } of items) {
      const [row] = await dbV2
        .insert(schema.production)
        .values({ skuName: sku_name, date, qty, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.production.skuName, schema.production.date],
          set: { qty, updatedAt: new Date() },
        })
        .returning();
      out.push(row);
    }
    return out;
  }
}

module.exports = new ProductionService();
