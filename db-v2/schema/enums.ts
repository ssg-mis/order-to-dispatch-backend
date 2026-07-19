import { pgEnum } from "drizzle-orm/pg-core";

// Constrained value sets that were free text in the old DB, where case drift
// (regular/Regular) and cross-field leakage ("Direct" landing in order_type)
// silently broke exact-match filters. Backfill normalizes case on the way in
// and maps blanks/unknowns to null.
export const orderTypeEnum = pgEnum("order_type", ["regular", "pre-approval"]);
export const orderCategoryEnum = pgEnum("order_category", ["Sales", "Stock Transfer"]);
export const deliveryPurposeEnum = pgEnum("delivery_purpose", ["week-on-week", "future-period"]);
export const orderThroughEnum = pgEnum("order_through", ["Direct", "Broker", "Salesperson"]);
