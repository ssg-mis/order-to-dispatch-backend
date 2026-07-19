import { index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { dispatches } from "./dispatches";
import { users } from "../users";

// Gates 6 (Make Invoice) + 7 (Check Invoice) merged into one table, per
// decision: same document progressing through a status, not two entities.
// Per DISPATCH (shipment) - each shipment is invoiced separately. Ported from
// makeInvoiceService.js:submitInvoice and checkInvoiceService.js:submitCheck.
// Real business rule: status = 'Issue' at check-invoice time reverts the
// document back to Make Invoice (nulls madeAt) - a write-path concern.
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => dispatches.id),

  // Make Invoice (gate 5)
  plannedMadeAt: timestamp("planned_made_at", { withTimezone: true }), // was planned_5
  madeAt: timestamp("made_at", { withTimezone: true }), // was actual_5
  madeByUserId: integer("made_by_user_id").references(() => users.id), // was make_invoice_user
  billType: varchar("bill_type", { length: 50 }),
  invoiceDate: timestamp("invoice_date", { withTimezone: false }),
  invoiceNo: text("invoice_no"),
  invoiceCopy: text("invoice_copy"),
  qty: numeric("qty", { precision: 15, scale: 4 }),
  billAmount: numeric("bill_amount", { precision: 14, scale: 2 }),

  // Check Invoice (gate 6)
  plannedCheckedAt: timestamp("planned_checked_at", { withTimezone: true }), // was planned_6
  checkedAt: timestamp("checked_at", { withTimezone: true }), // was actual_6
  checkedByUserId: integer("checked_by_user_id").references(() => users.id), // was check_invoice_user
  status: varchar("status", { length: 20 }), // was status_1 ('Issue' | ...)
  checkRemarks: text("check_remarks"), // was remarks_2
}, (t) => ({
  dispatchIdIdx: index("invoices_dispatch_id_idx").on(t.dispatchId),
  madeByUserIdIdx: index("invoices_made_by_user_id_idx").on(t.madeByUserId),
  checkedByUserIdIdx: index("invoices_checked_by_user_id_idx").on(t.checkedByUserId),
}));
