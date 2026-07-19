import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";

// Ported from `depot_details`. Dropped `salesman_broker_name` (a denormalized
// free-text pointer to "the" broker for this depot) - the real relationship
// is already captured the other way round, by brokers.depot_id.
export const depots = pgTable("depots", {
  id: serial("id").primaryKey(),
  depotCode: text("depot_code").unique(), // was depot_id (text) in the old schema
  status: varchar("status", { length: 50 }),
  depotName: varchar("depot_name", { length: 255 }).notNull(),
  depotAddress: text("depot_address"),
  state: varchar("state", { length: 100 }),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdByIdx: index("depots_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("depots_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("depots_pending_edit_by_idx").on(t.pendingEditBy),
}));
