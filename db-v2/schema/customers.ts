import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";
import { depots } from "./depots";

// Ported from `customer_details`. state/address stay structured columns here
// (not concatenated into one free-text string like the order-facing address
// fields elsewhere in the app) - GST state should be read from `state`
// directly, never re-parsed from a string.
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  customerCode: varchar("customer_code", { length: 50 }).notNull().unique(), // was customer_id
  status: varchar("status", { length: 20 }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  pan: varchar("pan", { length: 20 }),
  gstin: varchar("gstin", { length: 20 }),
  gstRegistered: varchar("gst_registered", { length: 30 }),
  contactPerson: varchar("contact_person", { length: 255 }),
  contact: text("contact"),
  email: varchar("email", { length: 255 }),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 10 }),

  // For a customer that REPRESENTS a destination depot (used as the "customer" on
  // a Stock Transfer), this is that depot - the real FK the inventory report uses
  // to attribute received stock, replacing the old customer_name-ILIKE-depot_name
  // fuzzy match. NULL for genuine external customers. Auto-resolved (single active
  // name match) by the resolve_customer_depot trigger; can be set/corrected explicitly.
  depotId: integer("depot_id").references(() => depots.id),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdByIdx: index("customers_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("customers_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("customers_pending_edit_by_idx").on(t.pendingEditBy),
  depotIdIdx: index("customers_depot_id_idx").on(t.depotId),
}));
