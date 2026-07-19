import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Actual-Dispatch work-in-progress drafts, keyed by order_key (the DO number
// string). One draft per order_key (unique); the whole in-progress form is
// stashed in draft_data jsonb. Written by draftService (Actual Dispatch page's
// "save draft"), read by gateInService (pending gate-in = drafts with no
// gate_in_records row). Auxiliary table — not part of the normalized order
// hierarchy. Ported verbatim from old RDS `dispatch_drafts`.
export const dispatchDrafts = pgTable("dispatch_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  orderKey: text("order_key").notNull().unique(),
  draftData: jsonb("draft_data").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow(),
});
