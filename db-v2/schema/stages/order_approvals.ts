import { boolean, index, integer, interval, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { orderItems } from "../order_items";
import { users } from "../users";

// Gate 2, per ORDER ITEM. overall_status kept as text (real data has 4 values:
// 'true','false','Approved','Cancelled', not a clean boolean). The approved
// quantity this gate decides lives on order_items.approved_qty.
export const orderApprovals = pgTable("order_approvals", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  rateIsRightlyAsPerCurrentMarketRate: boolean("rate_is_rightly_as_per_current_market_rate").default(false),
  weAreDealingInOrderedSku: boolean("we_are_dealing_in_ordered_sku").default(false),
  partyCreditStatus: varchar("party_credit_status", { length: 50 }),
  dispatchDateConfirmed: boolean("dispatch_date_confirmed").default(false),
  orderConfirmationWithCustomer: boolean("order_confirmation_with_customer").default(false),
  overallStatus: varchar("overall_status", { length: 50 }), // was overall_status_of_order
  approvedByUserId: integer("approved_by_user_id").references(() => users.id), // was order_approval_user
}, (t) => ({
  orderItemIdIdx: index("order_approvals_order_item_id_idx").on(t.orderItemId),
  approvedByUserIdIdx: index("order_approvals_approved_by_user_id_idx").on(t.approvedByUserId),
}));
