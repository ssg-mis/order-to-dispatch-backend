import { date, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// Daily production log per SKU (plant output at BANARI). Standalone auxiliary
// table — no FK into the order hierarchy (keyed by free-text sku_name, like the
// reference; the Production screen and the Inventory report both read it).
// Ported verbatim from the old RDS `production` table.
export const production = pgTable(
  "production",
  {
    id: serial("id").primaryKey(),
    skuName: text("sku_name").notNull(),
    date: date("date").notNull(),
    qty: integer("qty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    skuDateUnique: unique("production_sku_name_date_key").on(t.skuName, t.date),
  })
);
