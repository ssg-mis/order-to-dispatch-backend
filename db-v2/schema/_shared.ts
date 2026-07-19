import { integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

// Every master table in the old DB carries this same approval-workflow shape
// (edits to master data go through review before taking effect). Centralized
// here instead of repeated ad hoc per table.
export function approvalColumns() {
  return {
    approvalStatus: varchar("approval_status", { length: 20 }).default("approved").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    pendingChanges: jsonb("pending_changes"),
    pendingEditBy: integer("pending_edit_by").references(() => users.id),
    pendingEditAt: timestamp("pending_edit_at", { withTimezone: true }),
  };
}

export function timestampColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}
