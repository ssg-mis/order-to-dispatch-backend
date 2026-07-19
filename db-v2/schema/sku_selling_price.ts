import { index, numeric, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { approvalColumns } from "./_shared";

// Ported from the old `sku_selling_price` (32 rows): the packing-cost / landing-
// cost breakdown per packing material. Rate derivation reads net_oil_in_gm and
// packing_cost from here to convert between the 15kg-tin rate (A) and the
// per-litre GT (B). Carries the standard master approval-workflow columns.
export const skuSellingPrices = pgTable("sku_selling_price", {
  id: serial("id").primaryKey(),
  packingMaterial: text("packing_material"),
  skuWeight: numeric("sku_weight", { precision: 10, scale: 2 }),
  skuUnit: varchar("sku_unit", { length: 10 }),
  conversionFormula: numeric("conversion_formula", { precision: 10, scale: 2 }),
  skuWeightInGm: numeric("sku_weight_in_gm", { precision: 10, scale: 2 }),
  packingMaterialWeightInGm: numeric("packing_material_weight_in_gm", { precision: 10, scale: 2 }),
  netOilInGm: numeric("net_oil_in_gm", { precision: 10, scale: 2 }),
  packingCost: numeric("packing_cost", { precision: 10, scale: 2 }),
  var: text("var"),
  landingCost: numeric("landing_cost", { precision: 10, scale: 2 }),
  sellingCost: numeric("selling_cost", { precision: 10, scale: 2 }),
  margin: text("margin"),
  actualMargin: numeric("actual_margin", { precision: 5, scale: 2 }),
  ...approvalColumns(),
}, (t) => ({
  createdByIdx: index("sku_selling_price_created_by_idx").on(t.createdBy),
  reviewedByIdx: index("sku_selling_price_reviewed_by_idx").on(t.reviewedBy),
  pendingEditByIdx: index("sku_selling_price_pending_edit_by_idx").on(t.pendingEditBy),
}));
