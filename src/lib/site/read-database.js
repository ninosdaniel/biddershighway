import "server-only";
import { readFile } from "node:fs/promises";
import pg from "pg";
import path from "node:path";

let poolPromise;
export function hasReadDatabase() {
  return Boolean(process.env.WEBSITE_DATABASE_READ_URL);
}

// The pooler ignores startup options, so each checkout explicitly begins a
// READ ONLY transaction before executing any application query.
export async function readDatabase(sql, values = []) {
  if (!poolPromise) {
    poolPromise = readFile(
      path.join(process.cwd(), "config/supabase-ca.crt"),
      "utf8",
    )
      .then(
        (ca) =>
          new pg.Pool({
            connectionString: process.env.WEBSITE_DATABASE_READ_URL,
            ssl: { ca, rejectUnauthorized: true },
            max: 3,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 10000,
            application_name: "highway-website-read-only",
          }),
      )
      .catch((error) => {
        poolPromise = undefined;
        throw error;
      });
  }
  const pool = await poolPromise;
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await client.query(sql, values);
    await client.query("ROLLBACK");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
