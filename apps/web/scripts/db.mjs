import { createClient } from "@libsql/client";

/**
 * One place every script gets its database connection.
 *
 * Scripts each built their own client and half of them forgot the auth token,
 * which works silently against a local file and fails with an opaque 401
 * against a hosted database. Centralising it means that mistake cannot recur.
 */
export function connect() {
  const url = process.env.DATABASE_URL ?? "file:aptivus.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (!url.startsWith("file:") && !authToken) {
    console.error(
      `\nDATABASE_URL is remote (${url.split("?")[0]}) but DATABASE_AUTH_TOKEN is not set.\n` +
        "Turso will reject every request with HTTP 401.\n\n" +
        "  export DATABASE_URL='libsql://…'\n" +
        "  export DATABASE_AUTH_TOKEN='…'\n",
    );
    process.exit(1);
  }
  return createClient({ url, authToken });
}

/** Fail early and legibly rather than mid-write. */
export async function connectChecked() {
  const client = connect();
  try {
    await client.execute("select 1");
  } catch (e) {
    const status = e?.cause?.status;
    console.error(
      `\nCould not reach the database: ${e.message}\n` +
        (status === 401
          ? "\nHTTP 401 means the auth token was rejected. Check that it belongs to " +
            "this database, and that you copied all of it - the tokens are long and " +
            "truncate easily.\n"
          : ""),
    );
    process.exit(1);
  }
  return client;
}
