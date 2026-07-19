import { date, index, integer, numeric, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { approvalColumns, timestampColumns } from "./_shared";
import { transporters } from "./transporters";

// Ported from `vehicle_master`. `transporter` (free-text varchar) -> transporter_id (real FK).
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  vehicleCode: varchar("vehicle_code", { length: 50 }).unique(), // was vehicle_master_id
  status: varchar("status", { length: 20 }),
  registrationNo: varchar("registration_no", { length: 50 }).notNull().unique(),
  vehicleType: varchar("vehicle_type", { length: 50 }),
  transporterId: integer("transporter_id").references(() => transporters.id),
  // Categorical ownership status for vehicles that AREN'T linked to a real
  // transporter (old `transporter` free-text held the sentinels "Company
  // Vehicle"/"Party Vehicle" for these - not a denormalized FK duplicate,
  // there's no transporter master row for "our own fleet"/"a customer's own
  // vehicle" to link to). null when transporterId is set to a real transporter.
  ownershipType: varchar("ownership_type", { length: 20 }), // 'company' | 'party' | null
  rto: varchar("rto", { length: 50 }),
  fuelType: varchar("fuel_type", { length: 50 }),
  roadTax: date("road_tax"),
  roadTaxImage: text("road_tax_image"),
  lifeTimeTax: date("life_time_tax"),
  lifeTimeTaxImage: text("life_time_tax_image"),
  pollution: date("pollution"),
  pollutionImage: text("pollution_image"),
  insurance: date("insurance"),
  insuranceImage: text("insurance_image"),
  fitness: date("fitness"),
  fitnessImage: text("fitness_image"),
  statePermit: date("state_permit"),
  statePermitImage: text("state_permit_image"),
  statePermitType: varchar("state_permit_type", { length: 50 }),
  nationalPermit: date("national_permit"),
  nationalPermitImage: text("national_permit_image"),
  rcImage: text("rc_image"),
  gvw: numeric("gvw", { precision: 10, scale: 2 }),
  ulw: numeric("ulw", { precision: 10, scale: 2 }),
  passing: numeric("passing", { precision: 10, scale: 2 }),
  ...approvalColumns(),
  ...timestampColumns(),
}, (t) => ({
  transporterIdIdx: index("vehicles_transporter_id_idx").on(t.transporterId),
  createdByIdx: index("vehicles_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("vehicles_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("vehicles_pending_edit_by_idx").on(t.pendingEditBy),
}));
