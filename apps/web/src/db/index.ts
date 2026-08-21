import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * libsql rather than better-sqlite3: the latter has no working prebuild for
 * current Node and segfaults on opening a file. libsql also means the same
 * driver points at a local file in dev and a hosted database in production.
 */
const url = process.env.DATABASE_URL ?? "file:aptivus.db";
export const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
export const db = drizzle(client, { schema });
export { schema };
