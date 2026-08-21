/**
 * Apply every migration in drizzle/, in order.
 *
 *     node scripts/migrate.mjs
 *
 * Re-runnable. Drizzle emits bare `CREATE TABLE` / `CREATE INDEX`, so replaying
 * the whole directory against a database that already has the early migrations
 * used to abort on "table already exists" - which meant the only way to pick up
 * a new migration was to drop the database and lose the data. Statements that
 * fail *because the object already exists* are counted as already-applied;
 * every other error still stops the run, because those are real.
 */
import { connect } from "./db.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const client = connect();

const alreadyThere = (message) =>
  /already exists|duplicate column name/i.test(String(message ?? ""));

const dir = "drizzle";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  let applied = 0;
  let skipped = 0;
  for (const stmt of sql.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (!s) continue;
    try {
      await client.execute(s);
      applied++;
    } catch (e) {
      if (!alreadyThere(e.message)) {
        console.error(`\n${f}: ${e.message}\n\n${s}\n`);
        process.exit(1);
      }
      skipped++;
    }
  }
  console.log(`applied ${f} (${applied} new, ${skipped} already present)`);
}
const t = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log(`tables (${t.rows.length}):`);
console.log("  " + t.rows.map((r) => r.name).join(", "));
