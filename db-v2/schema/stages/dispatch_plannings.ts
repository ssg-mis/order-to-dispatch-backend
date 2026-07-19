import { index, integer, interval, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { orderItems } from "../order_items";
import { users } from "../users";

// Gate 3, per ORDER ITEM: the item's overall dispatch lifecycle (enters
// planning when approved, completes when remaining_qty hits 0) plus the
// revert / cancel / pre-close actions. The individual shipments planned out of
// it live in `dispatches` (many per item). remaining_qty itself lives on
// order_items as current state.
export const dispatchPlannings = pgTable("dispatch_plannings", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }), // set when item fully dispatched
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was dispatch_planning_user
  revertRemarks: text("revert_remarks"), // was revert_planning_remarks
  revertFromDispatchRemarks: text("revert_from_dispatch_remarks"), // was revert_dispatch_remarks
  cancelRemarks: text("cancel_remarks"),
  cancelledByUserId: integer("cancelled_by_user_id").references(() => users.id), // was cancel_user (text)
  precloseRemarks: text("preclose_remarks"),
  precloseByUserId: integer("preclose_by_user_id").references(() => users.id), // was preclose_user
}, (t) => ({
  orderItemIdIdx: index("dispatch_plannings_order_item_id_idx").on(t.orderItemId),
  performedByUserIdIdx: index("dispatch_plannings_performed_by_user_id_idx").on(t.performedByUserId),
  cancelledByUserIdIdx: index("dispatch_plannings_cancelled_by_user_id_idx").on(t.cancelledByUserId),
  precloseByUserIdIdx: index("dispatch_plannings_preclose_by_user_id_idx").on(t.precloseByUserId),
}));
