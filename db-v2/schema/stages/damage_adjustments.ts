import { date, index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { dispatches } from "./dispatches";
import { users } from "../users";

// Gate 10 (final), per DISPATCH (shipment) - ported from
// damageAdjustmentService.js:submitAdjustment. Only reached when
// material_receipts.damageStatus indicates damage.
export const damageAdjustments = pgTable("damage_adjustments", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => dispatches.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was damage_adjustment_user
  status: varchar("status", { length: 50 }), // was status_2, final status
  creditNoteDate: date("credit_note_date"),
  creditNoteNo: text("credit_note_no"),
  creditNoteCopy: text("credit_note_copy"),
  creditNoteQty: numeric("credit_note_qty", { precision: 15, scale: 4 }),
  creditNoteAmount: numeric("credit_note_amount", { precision: 14, scale: 2 }),
  netBalance: numeric("net_balance", { precision: 14, scale: 2 }), // was net_banalce (typo in old schema)
}, (t) => ({
  dispatchIdIdx: index("damage_adjustments_dispatch_id_idx").on(t.dispatchId),
  performedByUserIdIdx: index("damage_adjustments_performed_by_user_id_idx").on(t.performedByUserId),
}));
