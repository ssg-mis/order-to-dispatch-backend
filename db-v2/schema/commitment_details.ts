import { date, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { commitmentMain } from "./commitment_main";
import { orders } from "./orders";
import { orderItems } from "./order_items";
import { skus } from "./skus";

// One row per RAISE against a commitment. Each raise draws `sku_weight_mt` MT from
// the parent commitment's balance and spawns a real order (orders + order_items),
// linked here by order_id / order_item_id. Ported from `commitment_details`.
//
// The old table duplicated every order field (depot, broker, dates, payment
// terms, addresses, category …); in v2 those live on the spawned order/order_item,
// so this keeps ONLY the raise + balance-tracking data plus the link. The preclose
// "return to commitment" and Reliance-reject "revert" hooks adjust / delete rows
// here by order_item_id.
export const commitmentDetails = pgTable("commitment_details", {
  id: serial("id").primaryKey(),
  commitmentId: integer("commitment_id").notNull().references(() => commitmentMain.id),
  orderId: integer("order_id").references(() => orders.id), // spawned order (was order_no text)
  orderItemId: integer("order_item_id").references(() => orderItems.id), // spawned line
  raisedAt: timestamp("raised_at", { withTimezone: true }), // was actual1
  delayDays: integer("delay_days"), // was delay1
  poNo: text("po_no"),
  poDate: date("po_date"),
  skuId: integer("sku_id").references(() => skus.id), // was sku (text)
  skuQuantity: numeric("sku_quantity", { precision: 15, scale: 4 }), // boxes raised
  skuRate: numeric("sku_rate", { precision: 12, scale: 4 }),
  skuWeightMt: numeric("sku_weight_mt", { precision: 15, scale: 4 }), // MT drawn from the commitment balance
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  commitmentIdIdx: index("commitment_details_commitment_id_idx").on(t.commitmentId),
  orderIdIdx: index("commitment_details_order_id_idx").on(t.orderId),
  orderItemIdIdx: index("commitment_details_order_item_id_idx").on(t.orderItemId),
  skuIdIdx: index("commitment_details_sku_id_idx").on(t.skuId),
}));
