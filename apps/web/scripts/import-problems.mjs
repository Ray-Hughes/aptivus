/**
 * Load the v2 packs into the `problems` table.
 *
 *     node scripts/import-problems.mjs                # verify, then import
 *     node scripts/import-problems.mjs --skip-verify  # import without verifying
 *     node scripts/import-problems.mjs --pack federato
 *
 * Idempotent: problems are upserted on their slug, so running it twice is the
 * same as running it once. `created_at` and the row's `id` survive an update,
 * because anything already pointing at a problem - an attempt, a reveal - is
 * pointing at that id.
 *
 * By default it runs `packages/problems/verify.mjs` first and refuses to import
 * anything if a single reference solution fails its own tests. `verified_at` is
 * set only on that path; `--skip-verify` leaves it NULL, which is the honest
 * signal that nothing has checked this content. The same gate is what generated
 * problems will go through before a user ever sees one.
 *
 * The whole problem goes into `body`, hidden tests and reference solutions
 * included. That is the point of keeping it server-side: the API decides what
 * leaves the building.
 */
import { createClient } from "@libsql/client";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPacks, loadPack, loadPackProblems, PACKS_DIR } from "../../../packages/problems/src/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBLEMS_PKG = join(HERE, "..", "..", "..", "packages", "problems");

const args = process.argv.slice(2);
const skipVerify = args.includes("--skip-verify");
const onlyPack = args[args.indexOf("--pack") + 1];
const packFilter = args.includes("--pack") ? onlyPack : null;

const now = Math.floor(Date.now() / 1000);
const c = createClient({
  url: process.env.DATABASE_URL ?? "file:aptivus.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/* ------------------------------------------------------------------ */
/* verify first                                                        */
/* ------------------------------------------------------------------ */
let verifiedAt = null;
if (skipVerify) {
  console.log("skipping verification - imported problems will be marked unverified");
} else {
  console.log("verifying reference solutions (Python runs in Pyodide, so this takes a moment)...");
  const run = spawnSync(process.execPath, ["verify.mjs"], {
    cwd: PROBLEMS_PKG,
    encoding: "utf8",
    env: { ...process.env, APTIVUS_PACKS: PACKS_DIR },
  });
  const tail = (run.stdout ?? "").trim().split("\n").slice(-1)[0];
  if (run.status !== 0) {
    console.error(run.stdout ?? "");
    console.error(run.stderr ?? "");
    console.error("\nrefusing to import: at least one reference solution fails its own tests.");
    process.exit(1);
  }
  console.log(`verified: ${tail}`);
  verifiedAt = now;
}

/* ------------------------------------------------------------------ */
/* companies                                                           */
/* ------------------------------------------------------------------ */
async function upsertCompany(company) {
  await c.execute({
    sql: `INSERT INTO companies (id, slug, name, industry, is_published, created_at)
          VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(slug) DO UPDATE SET
            name = excluded.name,
            industry = excluded.industry,
            is_published = excluded.is_published`,
    args: [randomUUID(), company.slug, company.name, company.industry ?? null, now],
  });
  const row = await c.execute({ sql: "SELECT id FROM companies WHERE slug = ?", args: [company.slug] });
  return String(row.rows[0].id);
}

/* ------------------------------------------------------------------ */
/* problems                                                            */
/* ------------------------------------------------------------------ */
async function upsertProblem(problem, companyId) {
  // `path` is a loader convenience, not part of the format.
  const { path: _path, ...body } = problem;
  const res = await c.execute({
    sql: `INSERT INTO problems
            (id, slug, pack, company_id, kind, title, difficulty, pattern, minutes,
             body, source, verified_at, is_published, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'curated', ?, 1, ?)
          ON CONFLICT(slug) DO UPDATE SET
            pack = excluded.pack,
            company_id = excluded.company_id,
            kind = excluded.kind,
            title = excluded.title,
            difficulty = excluded.difficulty,
            pattern = excluded.pattern,
            minutes = excluded.minutes,
            body = excluded.body,
            source = excluded.source,
            verified_at = excluded.verified_at,
            is_published = excluded.is_published
          RETURNING id, created_at`,
    args: [
      randomUUID(), problem.id, problem.pack, companyId, problem.kind, problem.title,
      problem.difficulty, problem.pattern, problem.minutes,
      JSON.stringify(body), verifiedAt, now,
    ],
  });
  return res.rows[0];
}

const packs = listPacks().filter((p) => !packFilter || p === packFilter);
if (!packs.length) {
  console.error(packFilter ? `no pack named "${packFilter}"` : `no packs under ${PACKS_DIR}`);
  process.exit(1);
}

let total = 0;
for (const pack of packs) {
  const manifest = loadPack(pack);
  const companyIds = [];
  for (const company of manifest.companies) companyIds.push(await upsertCompany(company));
  // A pack targets at most one company today; the format allows several so a
  // shared pack can be surfaced under each of them once the UI needs it.
  const companyId = companyIds[0] ?? null;

  const problems = loadPackProblems(pack);
  for (const problem of problems) await upsertProblem(problem, companyId);
  total += problems.length;

  // A curated problem that has left the pack is unpublished rather than
  // deleted: attempts and reveals reference problem ids, and breaking someone's
  // history to tidy a listing is a bad trade. Generated problems (which belong
  // to a user) are never touched.
  const slugs = problems.map((p) => p.id);
  const retired = await c.execute({
    sql: `UPDATE problems SET is_published = 0
          WHERE pack = ? AND source = 'curated' AND is_published = 1
            AND slug NOT IN (${slugs.map(() => "?").join(", ")})
          RETURNING slug`,
    args: [pack, ...slugs],
  });
  for (const r of retired.rows) console.log(`  retired ${r.slug} (no longer in the pack)`);
  console.log(
    `${pack}: ${problems.length} problems` +
      (manifest.companies.length ? ` -> ${manifest.companies.map((x) => x.slug).join(", ")}` : ""),
  );
}

const counts = await c.execute(
  `SELECT kind, COUNT(*) AS n, SUM(verified_at IS NOT NULL) AS verified
   FROM problems GROUP BY kind ORDER BY kind`,
);
console.log(`imported ${total} problems`);
for (const r of counts.rows) console.log(`  ${r.kind}: ${r.n} (${r.verified} verified)`);
