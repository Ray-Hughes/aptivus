/**
 * Does the database this build will talk to actually have the columns this
 * build queries?
 *
 * This exists because it did not. A schema change shipped with its migration
 * un-run against production, and drizzle's `select().from(profiles)` names
 * every column explicitly - so the first request to /dashboard, /settings,
 * /learn/new and /admin/users/[id] came back "no such column: expertise" and
 * users got a 500. The build was green the whole time, because nothing ever
 * compared the code's expectations against the database's reality.
 *
 * A deploy that would 500 on its first request should fail as a deploy. That
 * is a bad afternoon for me instead of a broken site for everyone.
 *
 * The expected schema is derived by replaying drizzle/ into a scratch
 * database rather than by parsing schema.ts - the migrations are what actually
 * ran, so they are the honest source of truth.
 *
 *   node scripts/check-schema.mjs
 *
 * Set ALLOW_SCHEMA_DRIFT=1 to downgrade this to a warning. Reach for it when
 * you are deliberately deploying code ahead of a migration, and not otherwise.
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const url = process.env.DATABASE_URL ?? "file:aptivus.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url.startsWith("file:") && !authToken) {
  console.log("schema check: remote DATABASE_URL with no token, skipping");
  process.exit(0);
}

/* ---- what the code expects: replay the migrations into a scratch db ---- */
const scratchPath = join(tmpdir(), `aptivus-schema-${process.pid}.db`);
const scratch = createClient({ url: `file:${scratchPath}` });
for (const f of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(join("drizzle", f), "utf8").split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) await scratch.execute(s).catch(() => {});
  }
}

const columnsOf = async (client, table) =>
  new Set((await client.execute(`select name from pragma_table_info('${table}')`)).rows.map((r) => r.name));
const tablesOf = async (client) =>
  (await client.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_litestream%' order by name",
  )).rows.map((r) => r.name);

const expectedTables = await tablesOf(scratch);
const expected = new Map();
for (const t of expectedTables) expected.set(t, await columnsOf(scratch, t));

/* ---- what the database actually has ---- */
const live = createClient({ url, authToken });
try {
  await live.execute("select 1");
} catch (e) {
  console.error(`\nschema check: could not reach the database - ${e.message}\n`);
  rmSync(scratchPath, { force: true });
  process.exit(1);
}
const liveTables = new Set(await tablesOf(live));

const missing = [];
for (const [table, cols] of expected) {
  if (!liveTables.has(table)) {
    missing.push(`table ${table} does not exist`);
    continue;
  }
  const have = await columnsOf(live, table);
  for (const c of cols) if (!have.has(c)) missing.push(`${table}.${c} does not exist`);
}
rmSync(scratchPath, { force: true });

const where = url.startsWith("file:") ? url : url.split("?")[0];
if (!missing.length) {
  console.log(`schema check: ok (${expected.size} tables, ${where})`);
  process.exit(0);
}

const report =
  `\nschema check: the database is behind the code.\n\n` +
  `  database: ${where}\n\n` +
  missing.map((m) => `  missing: ${m}`).join("\n") +
  `\n\nDeploying this would return 500 on the first request that touches them.\n` +
  `Run the migrations against that database first:\n\n` +
  `  DATABASE_URL='${where}' DATABASE_AUTH_TOKEN='…' node scripts/migrate.mjs\n`;

if (process.env.ALLOW_SCHEMA_DRIFT === "1") {
  console.warn(report + "\nALLOW_SCHEMA_DRIFT=1 is set, continuing anyway.\n");
  process.exit(0);
}
console.error(report);
process.exit(1);
