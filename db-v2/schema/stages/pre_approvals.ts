import { boolean, index, integer, interval, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { orderItems } from "../order_items";
import { users } from "../users";

// Gate 1, per ORDER ITEM (verified: 97% of multi-item DOs approve their items
// at different times via the check/uncheck subset-select in the approval UI -
// see [[order-item-gating-granularity]]). Items approved together simply share
// a timestamp. Approved qty/rate live on order_items, not here.
export const preApprovals = pgTable("pre_approvals", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  takeRequiredRatesEachItem: boolean("take_required_rates_each_item").default(false),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id), // was pre_approval_user
}, (t) => ({
  orderItemIdIdx: index("pre_approvals_order_item_id_idx").on(t.orderItemId),
  approvedByUserIdIdx: index("pre_approvals_approved_by_user_id_idx").on(t.approvedByUserId),
}));
