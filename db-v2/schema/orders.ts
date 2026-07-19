import { boolean, date, index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { depots } from "./depots";
import { brokers } from "./brokers";
import { salespersons } from "./salespersons";
import { users } from "./users";
import { orderTypeEnum, orderCategoryEnum, deliveryPurposeEnum, orderThroughEnum } from "./enums";

// One row per REAL order = the base DO number (e.g. DO/26-27/0084). In the old
// DB a single order was scattered across suffix variants (0084A, 0084B, 0084A-1)
// and per-SKU rows, each duplicating all of this header data. Verified against
// the dump: base-DO variants agree on customer/depot/broker/address (0 conflicts),
// so collapsing them is safe. SKU lines live in order_items; per-line quantities,
// rates, and gate events all hang off the item, not here.
//
// Dropped from the old schema:
//  - is_order_through_broker: 100% redundant with (and in real data contradicting)
//    order_through - derivable as order_through IN ('Broker','Salesperson').
//  - all per-SKU columns (sku, uom, order_quantity, rates, oil_type, alt_*) -> order_items.
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNo: varchar("order_no", { length: 50 }).notNull().unique(), // base DO, now genuinely one row => unique
  customerId: integer("customer_id").references(() => customers.id),
  depotId: integer("depot_id").references(() => depots.id),
  brokerId: integer("broker_id").references(() => brokers.id),
  salespersonId: integer("salesperson_id").references(() => salespersons.id),

  orderType: orderTypeEnum("order_type"),
  orderCategory: orderCategoryEnum("order_category"),
  deliveryPurpose: deliveryPurposeEnum("delivery_purpose"), // was order_type_delivery_purpose
  orderThrough: orderThroughEnum("order_through"), // Direct | Broker | Salesperson (was is_order_through)

  customerType: varchar("customer_type", { length: 50 }),
  partySoDate: date("party_so_date"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  deliveryDate: date("delivery_date"),
  futurePeriodDate: date("future_period_date"),

  customerContactPersonName: varchar("customer_contact_person_name", { length: 255 }),
  customerContactPersonWhatsappNo: varchar("customer_contact_person_whatsapp_no", { length: 20 }),
  customerAddress: text("customer_address"), // billing address, per CLAUDE.md
  customerDeliveryAddress: text("customer_delivery_address"),

  paymentTerms: varchar("payment_terms", { length: 100 }),
  advancePaymentToBeTaken: boolean("advance_payment_to_be_taken").default(false),
  advanceAmount: numeric("advance_amount", { precision: 12, scale: 4 }),

  typeOfTransporting: varchar("type_of_transporting", { length: 100 }),
  freightRate: numeric("freight_rate", { precision: 10, scale: 2 }).default("0"),

  billCompanyName: varchar("bill_company_name", { length: 255 }),
  billAddress: text("bill_address"),
  shipCompanyName: varchar("ship_company_name", { length: 255 }),
  shipAddress: text("ship_address"),

  gst: text("gst"),
  manualSaudaNo: text("manual_sauda_no"), // "Manual Sauda No." — renamed from the misleading `process_id`; now matches dispatches.manual_sauda_no
  uploadSo: text("upload_so"),
  uploadCopy: text("upload_copy"),
  orderPunchRemarks: text("order_punch_remarks"),
  orderPunchUserId: integer("order_punch_user_id").references(() => users.id),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  customerIdIdx: index("orders_customer_id_idx").on(t.customerId),
  depotIdIdx: index("orders_depot_id_idx").on(t.depotId),
  brokerIdIdx: index("orders_broker_id_idx").on(t.brokerId),
  salespersonIdIdx: index("orders_salesperson_id_idx").on(t.salespersonId),
  orderPunchUserIdIdx: index("orders_order_punch_user_id_idx").on(t.orderPunchUserId),
  createdAtIdx: index("orders_created_at_idx").on(t.createdAt),
  partySoDateIdx: index("orders_party_so_date_idx").on(t.partySoDate),
}));
