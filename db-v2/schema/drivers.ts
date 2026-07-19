import { date, index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";

// Ported from `driver_master`.
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  driverCode: varchar("driver_code", { length: 20 }).unique(), // was driver_master_id
  status: varchar("status", { length: 20 }),
  driverName: varchar("driver_name", { length: 100 }).notNull(),
  drivingLicenceNo: varchar("driving_licence_no", { length: 50 }).unique(),
  drivingLicenceType: varchar("driving_licence_type", { length: 50 }),
  validUpto: date("valid_upto"),
  rto: varchar("rto", { length: 50 }),
  mobileNo: varchar("mobile_no", { length: 15 }),
  emailId: varchar("email_id", { length: 100 }),
  addressLine1: text("address_line1"),
  state: varchar("state", { length: 50 }),
  pincode: varchar("pincode", { length: 10 }),
  aadhaarNo: varchar("aadhaar_no", { length: 20 }),
  panNo: text("pan_no"),
  aadhaarUpload: text("aadhaar_upload"),
  dlUpload: text("dl_upload"),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdByIdx: index("drivers_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("drivers_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("drivers_pending_edit_by_idx").on(t.pendingEditBy),
}));
