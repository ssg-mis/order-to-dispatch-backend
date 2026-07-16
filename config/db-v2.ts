// Drizzle client for the new normalized v2 schema (order-to-dispatch-db-v2).
// Separate from config/db.js (the old raw-pg pool, still used by unmigrated
// services against the real RDS). Only stages that have been rewritten for v2
// should import this. Points at the local Docker Postgres until a stage's
// migration is complete and reviewed - never at RDS.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "order-to-dispatch-db-v2/src/schema/index";

const connectionString = process.env.DB_V2_URL;

if (!connectionString) {
  throw new Error("DB_V2_URL is not set - refusing to connect without an explicit target DB");
}

if (!connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")) {
  throw new Error(
    "DB_V2_URL does not point at localhost. This v2 schema is local-only until a stage's migration is explicitly approved for production - refusing to connect."
  );
}

const pool = new Pool({ connectionString });

export const dbV2 = drizzle(pool, { schema });
export { schema };
