import { numeric, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

// Ported verbatim from the old `sku_rate` (42 rows): a lookup of per-SKU rate
// FORMULAS. Each formula is linear in a single variable — A (the 15kg-tin rate)
// or B (the 1-litre GT) — e.g. "A-250", "((B-6.5)/990*910)+6". Regular orders
// store only rate_of_material, so this table lets us reverse-engineer
// rate_per_15kg / rate_per_ltr from it (see utils/rateDerivation). Pure
// reference data, no FKs, edited only via the master screens.
export const skuRates = pgTable("sku_rate", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 100 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  formula: text("formula"),
});
