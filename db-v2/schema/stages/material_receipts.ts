import { date, index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { dispatches } from "./dispatches";
import { users } from "../users";

// Gate 9, per DISPATCH (shipment) - ported from
// confirmMaterialReceiptService.js:submitReceipt. damage_status here gates
// whether Damage Adjustment (gate 10) gets scheduled - a write-path concern.
//
// Note: the old write path also re-sets `bill_amount` on this same call
// (billing correction for damaged goods) - in v2 that becomes a write to
// invoices.billAmount from this stage's data-access function, not a
// duplicated column here.
export const materialReceipts = pgTable("material_receipts", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull().references(() => dispatches.id),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was material_receipt_user
  materialReceivedDate: date("material_received_date"),
  receivedImageProof: text("received_image_proof"),
  damageStatus: varchar("damage_status", { length: 50 }),
  damageQty: numeric("damage_qty", { precision: 15, scale: 4 }),
  damageImage: text("damage_image"),
  remarks: text("remarks"), // was remarks_3
}, (t) => ({
  dispatchIdIdx: index("material_receipts_dispatch_id_idx").on(t.dispatchId),
  performedByUserIdIdx: index("material_receipts_performed_by_user_id_idx").on(t.performedByUserId),
}));
