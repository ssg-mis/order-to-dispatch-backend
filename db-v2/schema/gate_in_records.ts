import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Gate-In submissions (vehicle enters the plant premises before Actual
// Dispatch), keyed by order_key (DO number string), one per order_key. Stores
// the entry photos. Auxiliary table — not part of the normalized order
// hierarchy. Ported verbatim from old RDS `gate_in_records`.
export const gateInRecords = pgTable("gate_in_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderKey: text("order_key").notNull().unique(),
  username: text("username").notNull(),
  frontVehicleImage: text("front_vehicle_image"),
  backVehicleImage: text("back_vehicle_image"),
  driverPhoto: text("driver_photo"),
  gatepassPhoto: text("gatepass_photo"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
});
