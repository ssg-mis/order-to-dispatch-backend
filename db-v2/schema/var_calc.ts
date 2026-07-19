import { date, numeric, pgTable, serial, text, unique } from "drizzle-orm/pg-core";

// "Input Parameters" sidebar (variable-parameters page): a per-oil-type daily
// oil-rate breakdown (loose 1kg oil rate + freight -> total -> +5% GST -> grand
// total). The grand total (gt) feeds sku_selling_price.landing_cost derivation.
// Ported verbatim from the old RDS `var_calc` (14 rows). Column names match the
// reference EXACTLY (loose_1_kg_oil_rate / five_percent_gst / gt) because the
// variable-parameters page reads the raw row shape straight from the response.
export const varCalc = pgTable("var_calc", {
  looseOneKgOilRate: numeric("loose_1_kg_oil_rate", { precision: 10, scale: 2 }),
  freightRate: numeric("freight_rate", { precision: 10, scale: 2 }),
  total: numeric("total", { precision: 10, scale: 2 }),
  fivePercentGst: numeric("five_percent_gst", { precision: 10, scale: 2 }),
  gt: numeric("gt", { precision: 10, scale: 2 }),
  calculationDate: date("calculation_date"),
  oilType: text("oil_type"),
  id: serial("id").primaryKey(),
}, (t) => ({
  // One parameter row per (date, oil type). The service already guards this in
  // app code; this is the hard DB-level backstop so a race can never insert a
  // duplicate that would make getLatest/"already exists" ambiguous.
  dateOilTypeUnique: unique("var_calc_calculation_date_oil_type_key").on(t.calculationDate, t.oilType),
}));
