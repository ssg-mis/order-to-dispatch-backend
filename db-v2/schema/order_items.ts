import { type AnyPgColumn, index, integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { skus } from "./skus";

// One row per SKU line on an order. Each old order_dispatch row becomes one
// order_item. Carries the line's current-state quantities and rates (order_qty
// set at punch, approved_qty set at order-approval, remaining_qty whittled down
// by dispatch-planning as shipments go out). The gate events (who/when) live in
// the per-item gate tables; the actual shipments live in `dispatches`.
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  skuId: integer("sku_id").references(() => skus.id), // was product_name / sku_name text
  // Preserves the old suffix-variant order number this line came from (e.g.
  // 0084A vs 0084B under base DO 0084) - traceability only, not a business key.
  sourceOrderNo: varchar("source_order_no", { length: 50 }),

  // Explicit provenance, so "which of these lines is what was actually
  // punched" is a direct column read, never an inference from ids/timestamps.
  // 'punch' = created at Order Punch or Commitment Punch (the item's only
  // version, never split off a sibling). 'split' = the leftover half of a
  // partial pre-approval (see splitFromItemId for which line it split from).
  // 'added' = a new SKU line inserted during batch pre-approval, funded by
  // cascading budget from siblings - never existed on the original order.
  origin: varchar("origin", { length: 10 }).notNull().default("punch"), // 'punch' | 'split' | 'added'
  splitFromItemId: integer("split_from_item_id").references((): AnyPgColumn => orderItems.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  uom: varchar("uom", { length: 50 }),
  alternateUom: varchar("alternate_uom", { length: 50 }),
  alternateQtyKg: numeric("alternate_qty_kg", { precision: 12, scale: 3 }),
  oilType: varchar("oil_type", { length: 100 }),

  orderQuantity: numeric("order_quantity", { precision: 15, scale: 4 }),
  approvedQty: numeric("approved_qty", { precision: 15, scale: 4 }), // set at order-approval
  remainingQty: numeric("remaining_qty", { precision: 15, scale: 4 }), // whittled by dispatch-planning
  precloseQty: numeric("preclose_qty", { precision: 15, scale: 4 }).default("0"), // qty closed without dispatch

  // The quantity PUNCHED at Order/Commitment Punch, frozen WRITE-ONCE. Unlike
  // order_quantity (rewritten down by partial pre-approval and cascade budget
  // deduction), this never changes after creation - it's the auditable "what was
  // originally ordered" and the hard ceiling a product line can never exceed.
  // Stored ONCE, on the family ROOT (punch / added-SKU lines); split rows leave it
  // NULL and reference the root via budget_root_id, so SUM(original) across a family
  // still equals the punch (no double-count). The qty guard (src/sql/qty_guard.sql)
  // caps the family's total order_quantity at the root's value. Historical rows are
  // all roots, backfilled to GREATEST(order/approved/remaining/preclose).
  originalOrderQuantity: numeric("original_order_quantity", { precision: 15, scale: 4 }),

  // The budget-family ROOT: the punch order_item every split in the family draws
  // from. NULL means "this row IS the root" (punch / added-SKU lines). A partial
  // split points at the ultimate root (never at an intermediate split), so the
  // whole family shares one key: COALESCE(budget_root_id, id). Lets the qty guard
  // sum a family in one indexed lookup instead of walking split_from_item_id.
  budgetRootId: integer("budget_root_id").references((): AnyPgColumn => orderItems.id),

  rateOfMaterial: numeric("rate_of_material", { precision: 12, scale: 4 }),
  finalRate: numeric("final_rate", { precision: 12, scale: 4 }),
  ratePer15kg: numeric("rate_per_15kg", { precision: 12, scale: 4 }),
  ratePerLtr: numeric("rate_per_ltr", { precision: 12, scale: 4 }),
}, (t) => ({
  orderIdIdx: index("order_items_order_id_idx").on(t.orderId),
  skuIdIdx: index("order_items_sku_id_idx").on(t.skuId),
  splitFromItemIdIdx: index("order_items_split_from_item_id_idx").on(t.splitFromItemId),
  budgetRootIdIdx: index("order_items_budget_root_id_idx").on(t.budgetRootId),
}));
