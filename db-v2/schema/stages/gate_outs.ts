import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { dispatches } from "./dispatches";
import { users } from "../users";

// Gate 8, per DISPATCH (shipment) - ported from gateOutService.js:submitGateOut.
export const gateOuts = pgTable("gate_outs", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => dispatches.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was gate_out_user
  gatePassCopy: text("gate_pass_copy"),
  vehicleLoadedImage: text("vehicle_loaded_image"),
}, (t) => ({
  dispatchIdIdx: index("gate_outs_dispatch_id_idx").on(t.dispatchId),
  performedByUserIdIdx: index("gate_outs_performed_by_user_id_idx").on(t.performedByUserId),
}));
