import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";

// Ported from `transport_master`.
export const transporters = pgTable("transporters", {
  id: serial("id").primaryKey(),
  transporterCode: text("transporter_code").unique(), // was transport_master_id (text)
  status: varchar("status", { length: 20 }),
  transporterName: varchar("transporter_name", { length: 100 }).notNull(),
  contactPerson: varchar("contact_person", { length: 100 }),
  contactNumber: varchar("contact_number", { length: 15 }),
  emailId: varchar("email_id", { length: 100 }),
  addressLine1: text("address_line1"),
  state: varchar("state", { length: 50 }),
  pincode: varchar("pincode", { length: 10 }),
  pan: varchar("pan", { length: 20 }),
  gstin: varchar("gstin", { length: 20 }),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdByIdx: index("transporters_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("transporters_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("transporters_pending_edit_by_idx").on(t.pendingEditBy),
}));
