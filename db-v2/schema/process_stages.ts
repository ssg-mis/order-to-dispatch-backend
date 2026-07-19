import { integer, interval, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

// TAT (turn-around-time) config per stage, used to compute a gate row's
// planned_at = NOW() + stage_time at the moment the PREVIOUS gate completes.
// Was missing from the initial v2 cut - every stage service needs it to seed
// planned_at, so it's added here rather than each stage hardcoding an interval.
export const processStages = pgTable("process_stages", {
  id: serial("id").primaryKey(),
  stageName: varchar("stage_name", { length: 100 }).notNull().unique(),
  stageTime: interval("stage_time").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: false }).defaultNow(),
});
