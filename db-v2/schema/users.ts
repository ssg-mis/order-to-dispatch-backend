import { jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Ported from `login`. Everyone's created_by/reviewed_by/etc. across the whole
// schema points here.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password: text("password").notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phoneNo: varchar("phone_no", { length: 15 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  role: varchar("role", { length: 30 }).notNull(),
  pageAccess: jsonb("page_access"),
  depoAccess: jsonb("depo_access"),
  features: jsonb("features").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
