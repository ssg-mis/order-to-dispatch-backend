import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";
import { depots } from "./depots";

// Ported from `salesperson_details`, which in the old DB had NO primary key
// and reused broker_id as its identifier (it's an exact column-for-column
// copy of broker_details, minus a PK). Given a proper id here.
export const salespersons = pgTable("salespersons", {
  id: serial("id").primaryKey(),
  salespersonCode: text("salesperson_code").unique(),
  status: varchar("status", { length: 20 }),
  // was salesman_name - nullable: real data has 5/12 rows (status 'Inactive')
  // with no name recorded, confirmed against the actual dump, not assumed.
  salespersonName: varchar("salesperson_name", { length: 255 }),
  emailId: varchar("email_id", { length: 255 }),
  mobileNo: varchar("mobile_no", { length: 15 }),
  depotId: integer("depot_id").references(() => depots.id),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  depotIdIdx: index("salespersons_depot_id_idx").on(t.depotId),
  createdByIdx: index("salespersons_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("salespersons_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("salespersons_pending_edit_by_idx").on(t.pendingEditBy),
}));
