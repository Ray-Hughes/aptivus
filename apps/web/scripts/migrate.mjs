import { connect } from "./db.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL ?? "file:aptivus.db";
const client = connect();

const dir = "drizzle";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  for (const stmt of sql.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) await client.execute(s);
  }
  console.log("applied", f);
}
const t = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log(`tables (${t.rows.length}):`);
console.log("  " + t.rows.map((r) => r.name).join(", "));
