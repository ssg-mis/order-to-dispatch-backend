import { index, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";

// Ported from `sku_details`. sku_weight (net) and gross_weight are both real,
// separate columns here - the bug we fixed upstream was two different pages
// disagreeing on which column name held gross weight; having exactly one
// schema definition removes that whole failure mode.
export const skus = pgTable("skus", {
  id: serial("id").primaryKey(),
  skuCode: varchar("sku_code", { length: 100 }).notNull().unique(),
  skuName: varchar("sku_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }),
  mainUom: varchar("main_uom", { length: 50 }),
  alternateUom: varchar("alternate_uom", { length: 50 }),
  nosPerMainUom: numeric("nos_per_main_uom", { precision: 10, scale: 2 }),
  units: text("units"),
  oilFillingPerUnit: numeric("oil_filling_per_unit", { precision: 10, scale: 3 }),
  fillingUnits: text("filling_units"),
  convertedKg: numeric("converted_kg", { precision: 10, scale: 3 }),
  packingWeightPerMainUnit: numeric("packing_weight_per_main_unit", { precision: 10, scale: 3 }),
  weightDifference: numeric("weight_difference", { precision: 10, scale: 3 }),
  skuWeight: numeric("sku_weight", { precision: 10, scale: 3 }), // net weight per unit
  packingWeight: numeric("packing_weight", { precision: 10, scale: 3 }),
  grossWeight: numeric("gross_weight", { precision: 10, scale: 3 }),
  extraWeight: numeric("extra_weight", { precision: 10, scale: 3 }).default("0"),
  // Was a separate `tag` join table (id/name/sku_id UNIQUE) in the reference,
  // joined in as `t.name AS tag_name` wherever SKUs were listed. Only ever
  // used as a single per-SKU flag ('Yes'/'No', 7 rows total) with no live
  // management UI anywhere in the frontend (the `tagApi` CRUD wrapper exists
  // but has zero call sites) - collapsed into a plain column here rather than
  // porting an unused join table, same simplification as vehicles.ownershipType.
  // Commitment Punch's SKU picker filters on this (tag_name === 'Yes').
  tagName: varchar("tag_name", { length: 50 }),
  ...approvalColumns(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdByIdx: index("skus_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("skus_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("skus_pending_edit_by_idx").on(t.pendingEditBy),
}));
