// Drizzle client for the normalized v2 schema (order-to-dispatch-db-v2).
// Target DB is selected by NODE_ENV alone, not by which vars happen to be
// set/commented in .env: non-production is hard-locked to local Docker
// Postgres (DB_V2_LOCAL_URL), and only NODE_ENV=production may reach RDS
// (DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT/DB_SSL). Both var sets can
// stay uncommented in .env at all times - there's nothing to keep in sync.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db-v2/schema/index";

function isLocalHost(host: string | undefined) {
  return host === "localhost" || host === "127.0.0.1";
}

function isLocalConnectionString(connectionString: string) {
  return connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
}

const isProduction = process.env.NODE_ENV === "production";

let pool: Pool;

if (isProduction) {
  const connectionString = process.env.DB_V2_PROD_URL;
  const host = process.env.DB_HOST;

  if (!connectionString && !host) {
    throw new Error("NODE_ENV=production but neither DB_V2_PROD_URL nor DB_HOST is set - refusing to connect without an explicit target DB");
  }

  const targetIsLocal = connectionString ? isLocalConnectionString(connectionString) : isLocalHost(host);
  if (targetIsLocal) {
    throw new Error("NODE_ENV=production but the configured DB target resolves to localhost - refusing to run production against a local database");
  }

  pool = connectionString
    ? new Pool({ connectionString })
    : new Pool({
        host,
        port: parseInt(process.env.DB_PORT || "5432", 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      });
} else {
  const connectionString = process.env.DB_V2_LOCAL_URL;

  if (!connectionString) {
    throw new Error("NODE_ENV is not production but DB_V2_LOCAL_URL is not set - refusing to connect without an explicit local target DB");
  }

  if (!isLocalConnectionString(connectionString)) {
    throw new Error("NODE_ENV is not production but DB_V2_LOCAL_URL does not resolve to localhost - refusing to connect a non-production run to a non-local database");
  }

  pool = new Pool({ connectionString });
}

export const dbV2 = drizzle(pool, { schema });
export { schema };
