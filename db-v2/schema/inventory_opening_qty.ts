import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// Manually-entered opening stock per depot+product, the baseline the Inventory
// report adds stock-in/production and subtracts stock-out/sales from. Standalone
// auxiliary table keyed by free-text depo_name/product_name (matches the
// reference). Ported verbatim from the old RDS `inventory_opening_qty`.
export const inventoryOpeningQty = pgTable(
  "inventory_opening_qty",
  {
    id: serial("id").primaryKey(),
    depoName: text("depo_name").notNull(),
    productName: text("product_name").notNull(),
    openingQty: integer("opening_qty").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    depoProductUnique: unique("inventory_opening_qty_depo_name_product_name_key").on(t.depoName, t.productName),
  })
);
