/**
 * A hand-written sample track, so the learning UI can be seen and reviewed
 * without an API key and without spending anything.
 *
 * These three lessons are written the way the generator is asked to write
 * them - Ruby habit first, Python spelling second, then the trap - and the
 * traps come straight out of packages/transitions/ruby-to-python.json. They
 * are a fixture for the player, not a substitute for a real roadmap: a real
 * one is ordered against YOUR job, and this one is ordered against nobody's.
 * The track says so on its own rationale.
 *
 *   node scripts/seed-sample-track.mjs <email>
 */
import { readFileSync } from "node:fs";
import { connectChecked } from "./db.mjs";
import { randomUUID } from "node:crypto";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/seed-sample-track.mjs <email>");
  process.exit(1);
}

const c = await connectChecked();
const NOW = Math.floor(Date.now() / 1000);

const [user] = (await c.execute({ sql: "select id from users where email = ?", args: [email.toLowerCase()] })).rows;
if (!user) {
  console.error(`No user with email ${email}. Sign up first.`);
  process.exit(1);
}

import { LESSONS } from "./seed-lessons.mjs";

/* ------------------------------------------------------------------ *
 * The same gate the generated lessons go through.
 *
 * These rows are written with verified_at set, which is what makes the player
 * show them. Setting that by hand without running anything would be exactly
 * the thing the gate exists to prevent, only committed to the repo where it
 * would be believed. So the seeder runs each lesson's own solution against its
 * own tests, through the same engine.py the learner's browser runs, and
 * refuses to write anything if one fails.
 * ------------------------------------------------------------------ */
const { loadPyodide } = await import("pyodide");
const py = await loadPyodide();
py.FS.writeFile("/home/pyodide/engine.py", readFileSync("public/engine.py", "utf8"));
py.runPython("import sys; sys.path.insert(0, '/home/pyodide')\nimport engine, json\n");

let unverified = 0;
for (const l of LESSONS) {
  if (l.scaffold.trim() === l.solution.trim()) {
    console.error(`  ${l.title}: scaffold is the solution - nothing to complete`);
    unverified++;
    continue;
  }
  // JSON crosses as text and is parsed in Python: JS has one number type and
  // would turn an expected 1.0 into 1, changing what the test asserts.
  py.globals.set("_req", JSON.stringify({
    op: "run", code: l.solution, cases: l.tests, mode: "function", func: l.func,
  }));
  const out = JSON.parse(py.runPython("json.dumps(engine.dispatch(json.loads(_req)))"));
  const failed = (out.results ?? []).findIndex((r) => !r.passed);
  if (!out.results?.length || failed >= 0) {
    const r = out.results?.[failed];
    console.error(`  ${l.title}: ${r ? (r.error || `test ${failed + 1} expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.got)}`) : "no tests ran"}`);
    unverified++;
  }
}
if (unverified) {
  console.error(`\n${unverified} sample lesson(s) fail their own tests. Nothing was seeded.\n`);
  process.exit(1);
}
console.log(`${LESSONS.length} sample lessons pass their own tests`);

const existing = (await c.execute({
  sql: "select id from language_tracks where user_id = ? and job_title = ?",
  args: [user.id, "Sample track"],
})).rows[0];
if (existing) {
  await c.execute({ sql: "delete from language_tracks where id = ?", args: [existing.id] });
  console.log("replaced the previous sample track");
}

const trackId = randomUUID();
await c.execute({
  sql: `insert into language_tracks
        (id, user_id, target_language, known_languages, job_title, job_context, rationale, status, created_at, ready_at)
        values (?,?,?,?,?,?,?,?,?,?)`,
  args: [
    trackId, user.id, "python", JSON.stringify(["ruby"]), "Sample track",
    "Hand-written, so the player can be seen without spending anything.",
    "This is a fixture, not a roadmap. Three lessons picked because they are the " +
    "traps that bite Rubyists hardest in Python - emptiness being falsy, a method " +
    "without parentheses being an object, and a default argument built once. A real " +
    "track is ordered against the job you paste in; this one is ordered against nobody's.",
    "ready", NOW, NOW,
  ],
});

for (const [i, l] of LESSONS.entries()) {
  await c.execute({
    sql: `insert into track_lessons
          (id, track_id, position, title, relevance, estimated_minutes, body, verified_at, created_at)
          values (?,?,?,?,?,?,?,?,?)`,
    args: [
      randomUUID(), trackId, i + 1, l.title, l.relevance, l.estimatedMinutes,
      JSON.stringify({
        title: l.title, relevance: l.relevance, estimatedMinutes: l.estimatedMinutes,
        teaching: l.teaching, func: l.func, scaffold: l.scaffold, solution: l.solution,
        hints: l.hints, tests: l.tests,
      }),
      NOW, NOW,
    ],
  });
}

console.log(`sample track seeded for ${email}: /learn/${trackId}`);
