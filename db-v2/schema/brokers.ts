import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";
import { depots } from "./depots";

// Ported from `broker_details`. depot_name (free text) -> depot_id (real FK).
export const brokers = pgTable("brokers", {
  id: serial("id").primaryKey(),
  brokerCode: text("broker_code").unique(), // was broker_id (text)
  status: varchar("status", { length: 20 }),
  brokerName: varchar("broker_name", { length: 255 }).notNull(), // was salesman_name
  emailId: varchar("email_id", { length: 255 }),
  mobileNo: varchar("mobile_no", { length: 15 }),
  depotId: integer("depot_id").references(() => depots.id),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  depotIdIdx: index("brokers_depot_id_idx").on(t.depotId),
  createdByIdx: index("brokers_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("brokers_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("brokers_pending_edit_by_idx").on(t.pendingEditBy),
}));
