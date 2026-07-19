import { date, index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { customers } from "./customers";

// A bulk pre-sale promise: a customer commits to buy `quantity` MT of an oil type
// at a rate. It is "raised" in chunks over time (see commitment_details); each
// raise draws down the balance and spawns a real order. Ported from the old
// `commitment_main` table with two v2 clean-ups:
//   - the free-text `party_name` becomes a real customers FK (`customer_id`);
//   - the reference's runtime ensureColumns() ALTER TABLE hack is gone — every
//     column is declared here.
export const commitmentMain = pgTable("commitment_main", {
  id: serial("id").primaryKey(),
  commitmentNo: varchar("commitment_no", { length: 50 }).notNull().unique(),
  commitmentDate: date("commitment_date"),
  customerId: integer("customer_id").references(() => customers.id), // was party_name (free text)
  oilType: varchar("oil_type", { length: 100 }),
  quantity: numeric("quantity", { precision: 15, scale: 4 }), // total committed MT
  unit: varchar("unit", { length: 50 }),
  rate: numeric("rate", { precision: 12, scale: 4 }),
  plannedAt: timestamp("planned_at", { withTimezone: true }), // was planned1
  customerContactPersonName: varchar("customer_contact_person_name", { length: 255 }),
  whatsappNo: varchar("whatsapp_no", { length: 20 }),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), // was timestamp
}, (t) => ({
  customerIdIdx: index("commitment_main_customer_id_idx").on(t.customerId),
}));
