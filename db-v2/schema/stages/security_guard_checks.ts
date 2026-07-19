import { index, integer, interval, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { dispatches } from "./dispatches";
import { users } from "../users";

// Gate 5, per DISPATCH (shipment) - ported from
// securityGuardApprovalService.js:submitApproval. Real business rule: a REJECT
// here nulls out both this gate and the Actual Dispatch stamp on the old row -
// rejecting kicks the shipment back to redo Actual Dispatch. That cross-stage
// revert is an app-layer/write-path concern, not a schema attribute.
export const securityGuardChecks = pgTable("security_guard_checks", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => dispatches.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  verdictStatus: varchar("verdict_status", { length: 20 }), // 'APPROVE' | 'REJECT', was security_guard_status
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was security_guard_user
  revertRemarks: text("revert_remarks"), // was revert_security_remarks
  biltyNo: text("bilty_no"),
  biltyImage: text("bilty_image"),
  vehicleImageAttachment: text("vehicle_image_attachment"), // was vehicle_image_attachemrnt (typo in old schema)
}, (t) => ({
  dispatchIdIdx: index("security_guard_checks_dispatch_id_idx").on(t.dispatchId),
  performedByUserIdIdx: index("security_guard_checks_performed_by_user_id_idx").on(t.performedByUserId),
}));
