import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * libsql rather than better-sqlite3: the latter has no working prebuild for
 * current Node and segfaults on opening a file. libsql also means the same
 * driver points at a local file in dev and a hosted database in production.
 */
const url = process.env.DATABASE_URL ?? "file:aptivus.db";

// Serverless filesystems are ephemeral. A file: URL deployed to Vercel appears
// to work and then quietly loses every signup on the next cold start, which is
// far worse than refusing to boot. Point DATABASE_URL at a hosted libsql
// (Turso) instance instead - same driver, same SQL, just a URL and a token.
if (
  url.startsWith("file:") &&
  (process.env.VERCEL === "1" ||
    process.env.APTIVUS_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE !== "phase-production-build"))
) {
  throw new Error(
    "DATABASE_URL points at a local file, which cannot persist on a serverless " +
      "host. Set it to a libsql:// URL and provide DATABASE_AUTH_TOKEN.",
  );
}

export const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
export const db = drizzle(client, { schema });
export { schema };
