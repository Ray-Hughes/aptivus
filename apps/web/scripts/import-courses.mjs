/**
 * Load `packages/courses/*.course.json` into the `courses` table.
 *
 *     node scripts/import-courses.mjs                  # validate, then import
 *     node scripts/import-courses.mjs --skip-validate  # import without validating
 *     node scripts/import-courses.mjs --course sql-for-interviews
 *
 * Idempotent: courses are upserted on their slug, so running it twice is the
 * same as running it once. The row's `id` and `created_at` survive an update -
 * progress rows key off the course *slug* rather than the row id, so nothing
 * a learner has done depends on the import, but keeping ids stable is still the
 * cheaper habit.
 *
 * By default it runs `packages/courses/validate.mjs` first and refuses to
 * import anything if a single course fails schema or semantic checks - the same
 * gate `import-problems.mjs` puts in front of the packs. That validator is also
 * what checks every referenced problem slug exists under `packs/`, so a course
 * cannot land pointing at a problem the app cannot open.
 *
 * The whole course document goes into `body`: teaching markdown, checkpoint
 * answer keys and all. Checkpoint answers are graded server-side and never sent
 * to the browser before they are earned, which is only possible because the
 * answer key lives here rather than in the bundle.
 */
import { connect } from "./db.mjs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COURSES_PKG = join(HERE, "..", "..", "..", "packages", "courses");

const args = process.argv.slice(2);
const skipValidate = args.includes("--skip-validate");
const only = args.includes("--course") ? args[args.indexOf("--course") + 1] : null;

const now = Math.floor(Date.now() / 1000);
const c = connect();

/* ------------------------------------------------------------------ */
/* validate first                                                      */
/* ------------------------------------------------------------------ */
if (skipValidate) {
  console.log("skipping validation - importing whatever is on disk");
} else {
  const run = spawnSync(process.execPath, ["validate.mjs"], {
    cwd: COURSES_PKG,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    console.error(run.stdout ?? "");
    console.error(run.stderr ?? "");
    console.error("\nrefusing to import: at least one course failed validation.");
    process.exit(1);
  }
  const summary = (run.stdout ?? "").trim().split("\n").filter(Boolean).at(-2);
  console.log(`validated: ${summary ?? "ok"}`);
}

/* ------------------------------------------------------------------ */
/* read                                                                */
/* ------------------------------------------------------------------ */
const files = readdirSync(COURSES_PKG)
  .filter((f) => f.endsWith(".course.json"))
  .sort();

const loaded = files
  .map((f) => JSON.parse(readFileSync(join(COURSES_PKG, f), "utf8")))
  .filter((course) => !only || course.slug === only);

if (!loaded.length) {
  console.error(only ? `no course with slug "${only}"` : `no courses in ${COURSES_PKG}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* import                                                              */
/* ------------------------------------------------------------------ */

/** Every problem the app actually holds, so the import can report the gap. */
const known = new Set(
  (await c.execute("SELECT slug FROM problems WHERE is_published = 1")).rows.map(
    (r) => String(r.slug),
  ),
);

async function upsertCourse(course) {
  // `$schema` is an editor convenience, not part of the document.
  const { $schema: _schema, ...body } = course;
  const problemSlugs = new Set(
    body.modules.flatMap((m) => m.problems.map((p) => p.slug)),
  );

  await c.execute({
    sql: `INSERT INTO courses
            (id, slug, title, subtitle, audience, level, estimated_hours, time_note,
             version, module_count, problem_count, tags, body, is_published,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title = excluded.title,
            subtitle = excluded.subtitle,
            audience = excluded.audience,
            level = excluded.level,
            estimated_hours = excluded.estimated_hours,
            time_note = excluded.time_note,
            version = excluded.version,
            module_count = excluded.module_count,
            problem_count = excluded.problem_count,
            tags = excluded.tags,
            body = excluded.body,
            is_published = excluded.is_published,
            updated_at = excluded.updated_at`,
    args: [
      randomUUID(), body.slug, body.title, body.subtitle, body.audience,
      body.level ?? null, body.estimatedHours, body.timeNote ?? null,
      body.version ?? 1, body.modules.length, problemSlugs.size,
      JSON.stringify(body.tags ?? []), JSON.stringify(body), now, now,
    ],
  });

  const missing = [...problemSlugs].filter((s) => !known.has(s));
  return { modules: body.modules.length, problems: problemSlugs.size, missing };
}

for (const course of loaded) {
  const { modules, problems, missing } = await upsertCourse(course);
  console.log(
    `${course.slug}: ${modules} modules, ${problems} problems, ${course.estimatedHours}h`,
  );
  // Not fatal: a course is allowed to describe a curriculum ahead of the
  // library. It is worth saying out loud, because those problems render as
  // "not available yet" rather than as a link.
  for (const slug of missing) {
    console.log(`  ! ${slug} is referenced but not in the problems table`);
  }
}

// A course that has left the repo is unpublished rather than deleted: progress
// rows reference the slug, and wiping someone's history to tidy a listing is a
// bad trade. Scoped out when --course was used, which only saw one file.
if (!only) {
  const slugs = loaded.map((x) => x.slug);
  const retired = await c.execute({
    sql: `UPDATE courses SET is_published = 0, updated_at = ?
          WHERE is_published = 1 AND slug NOT IN (${slugs.map(() => "?").join(", ")})
          RETURNING slug`,
    args: [now, ...slugs],
  });
  for (const r of retired.rows) console.log(`  retired ${r.slug} (no longer authored)`);
}

const totals = await c.execute(
  `SELECT COUNT(*) AS n, SUM(module_count) AS modules, SUM(estimated_hours) AS hours
   FROM courses WHERE is_published = 1`,
);
const t = totals.rows[0];
console.log(`imported ${loaded.length} courses`);
console.log(`  published: ${t.n} courses, ${t.modules} modules, ${t.hours} hours`);
