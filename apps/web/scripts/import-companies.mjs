import { connectChecked } from "./db.mjs";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const c = await connectChecked();
const raw = JSON.parse(readFileSync("../../packs/companies/companies.json", "utf8"));
const list = raw.companies ?? raw;
let added = 0, updated = 0;

for (const co of list) {
  const slug = co.slug ?? co.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = await c.execute({ sql: "SELECT id FROM companies WHERE slug = ?", args: [slug] });
  const profile = JSON.stringify(co);
  if (existing.rows.length) {
    await c.execute({
      sql: "UPDATE companies SET name=?, industry=?, profile=?, is_published=1 WHERE slug=?",
      args: [co.name, co.industry ?? null, profile, slug],
    });
    updated++;
  } else {
    await c.execute({
      sql: `INSERT INTO companies (id, slug, name, industry, profile, is_published, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [randomUUID(), slug, co.name, co.industry ?? null, profile,
             Math.floor(Date.now() / 1000)],
    });
    added++;
  }
}
console.log(`companies imported: ${added} added, ${updated} updated`);
