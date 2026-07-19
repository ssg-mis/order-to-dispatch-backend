import { boolean, date, index, integer, interval, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { orderItems } from "../order_items";
import { users } from "../users";
import { vehicles } from "../vehicles";
import { drivers } from "../drivers";
import { transporters } from "../transporters";

// A physical SHIPMENT of an order item (was lift_receiving_confirmation). One
// order_item can have MANY dispatches - up to 26 seen in real data - as its
// remaining_qty is dispatched across multiple trucks/trips. Each row is one
// DSR. The old table stored the SAME vehicle/driver/transporter identity three
// different ways (truck_no, vehicle_number, registration_no as separate text
// columns, plus driver_name/driving_license_no/transporter_name free text
// duplicating master data) - consolidated here into three real FKs. Per-trip
// facts (this weighbridge reading, this document-validity check at dispatch
// time) stay as real columns. Downstream gates (security, invoice, gate-out,
// receipt, damage) hang off THIS shipment, not the order.
export const dispatches = pgTable("dispatches", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id),
  dsrNumber: varchar("dsr_number", { length: 50 }).unique(), // was d_sr_number
  // Row-birth timestamp (was lift_receiving_confirmation.timestamp) - the
  // shipment's own "Dispatch Date", distinct from plannedAt (which already
  // holds the TAT-shifted Actual Dispatch deadline, not the mint moment).
  // Found missing while porting the Dispatch Report (CLAUDE.md's "Dispatch
  // Date" column) - there was no way to recover this at all otherwise.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  actualAt: timestamp("actual_at", { withTimezone: true }),
  performedByUserId: integer("performed_by_user_id").references(() => users.id), // was actual_dispatch_user

  // Per-shipment snapshot of orders.manual_sauda_no ("Manual Sauda No.") taken at
  // mint time (was lift_receiving_confirmation.processid, itself an INSERT-time
  // copy in the reference app - not a live value). Genuinely diverges from the
  // order's CURRENT manual_sauda_no over time: it can be edited later at Order
  // Approval, which would otherwise silently rewrite this value for every
  // already-dispatched shipment of the order if read live off orders.
  manualSaudaNo: text("manual_sauda_no"),

  // ─── Quantities — all counted in BOX/TIN (the packing unit the order is placed in) ───
  // PLANNED per-line count, set at Dispatch Planning: how many boxes/tins this
  // one shipment line is meant to carry.
  qtyToBeDispatched: numeric("qty_to_be_dispatched", { precision: 15, scale: 4 }),
  // ACTUAL per-line count that physically left the gate for THIS shipment line.
  // This is the per-line source of truth — reports use it (falling back to
  // qtyToBeDispatched) for per-line amount/weight math.
  actualQtyDispatch: numeric("actual_qty_dispatch", { precision: 15, scale: 4 }),
  // ⚠ NOT this line's own quantity — despite the similar name it is the
  // DENORMALISED INVOICE-LEVEL TOTAL: the sum of every line's actualQtyDispatch
  // across the whole invoice, copied identically onto each line (mirrors
  // invoices.qty). Verified against real data: it differs from actualQtyDispatch
  // on ~80% of rows (e.g. a 22-line invoice — per-line 35/50/10/… vs actual_qty
  // = 1331 on every line). Reports read it ONLY for invoice grand-totals.
  // Do NOT read it as a per-line qty and do NOT merge it with actualQtyDispatch.
  actualQty: numeric("actual_qty", { precision: 15, scale: 4 }),
  checkStatus: text("check_status"),
  remarks: text("remarks"),
  dispatchFrom: text("dispatch_from"),

  vehicleId: integer("vehicle_id").references(() => vehicles.id), // was truck_no / vehicle_number / registration_no
  driverId: integer("driver_id").references(() => drivers.id), // was driver_name / driving_license_no text fields
  transporterId: integer("transporter_id").references(() => transporters.id), // was transporter_name
  vehicleNoPlateImage: text("vehicle_no_plate_image"),

  // Document-validity checks performed at time of dispatch: an uploaded
  // photo of each document (not a boolean - confirmed against real data,
  // these are S3 image URLs), paired with a snapshot expiry date (the
  // vehicle/driver's own expiry fields can change later, this is what was
  // true at dispatch time).
  fitnessImage: text("fitness_image"),
  fitnessEndDate: date("fitness_end_date"),
  insuranceImage: text("insurance_image"),
  insuranceEndDate: date("insurance_end_date"),
  taxCopyImage: text("tax_copy_image"),
  taxEndDate: date("tax_end_date"),
  pollutionImage: text("pollution_image"),
  pollutionEndDate: date("pollution_end_date"),
  permit1Image: text("permit1_image"),
  permit1EndDate: date("permit1_end_date"),
  permit2OutStateImage: text("permit2_out_state_image"),
  permit2EndDate: date("permit2_end_date"),

  weightmentSlipCopy: text("weightment_slip_copy"),
  rstNo: text("rst_no"),
  grossWeight: numeric("gross_weight", { precision: 12, scale: 3 }),
  tareWeight: numeric("tare_weight", { precision: 12, scale: 3 }),
  netWeight: numeric("net_weight", { precision: 12, scale: 3 }),
  extraWeight: numeric("extra_weight", { precision: 12, scale: 3 }).default("0"),
  packagingWeight: numeric("packaging_weight", { precision: 10, scale: 2 }).default("0"),
  passingWeight: numeric("passing_weight", { precision: 10, scale: 2 }),
  difference: numeric("difference", { precision: 10, scale: 2 }).default("0"), // weight/qty discrepancy
  reasonOfWeightDifference: text("reason_of_weight_difference"),
  vehicleOverloadRemarks: text("vehicle_overload_remarks"),

  freightRateType: varchar("freight_rate_type", { length: 50 }),
  freightAmount: numeric("freight_amount", { precision: 12, scale: 2 }),
  cdAmount: numeric("cd_amount", { precision: 10, scale: 4 }), // cash discount
  advanceBhadaBank: numeric("advance_bhada_bank", { precision: 10, scale: 2 }),
  advanceBhadaDieselAdvance: numeric("advance_bhada_diesel_advance", { precision: 10, scale: 2 }),
  advanceBhadaCash: numeric("advance_bhada_cash", { precision: 10, scale: 2 }),
  finalRate: numeric("final_rate", { precision: 10, scale: 2 }),

  isTransfer: boolean("is_transfer").default(false),
}, (t) => ({
  orderItemIdIdx: index("dispatches_order_item_id_idx").on(t.orderItemId),
  performedByUserIdIdx: index("dispatches_performed_by_user_id_idx").on(t.performedByUserId),
  vehicleIdIdx: index("dispatches_vehicle_id_idx").on(t.vehicleId),
  driverIdIdx: index("dispatches_driver_id_idx").on(t.driverId),
  transporterIdIdx: index("dispatches_transporter_id_idx").on(t.transporterId),
}));
