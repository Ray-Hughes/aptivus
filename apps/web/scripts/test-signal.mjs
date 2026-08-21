/**
 * The adaptation logic, tested against a real database.
 *
 *   npm run test:signal        (no dev server needed)
 *
 * This decides what every learner gets next, from data they generated without
 * being asked. It is worth being sure about the boundaries: exactly where
 * "steady" becomes "struggling", and that reading a solution or walking away
 * outweighs a low attempt count - someone who quietly gave up twice looks
 * effortless if you only average attempts.
 */
import { connectChecked } from "./db.mjs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";

const c = await connectChecked();
const now = Math.floor(Date.now() / 1000);
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`); };

const userId = randomUUID();
await c.execute({
  sql: "insert into users (id, email, display_name, role, gem_balance, created_at) values (?,?,?,?,?,?)",
  args: [userId, `signal-${Date.now()}@aptivus.test`, "Signal", "user", 0, now],
});

/* The module is TypeScript with a server-only guard, so it is exercised
   through a tiny harness compiled the same way the app compiles it. */
mkdirSync(".signal-tmp", { recursive: true });
// The module carries `import "server-only"`, which Next aliases at build time
// and plain node cannot resolve. The copy is the file verbatim minus that one
// line, so what is tested is still the shipped logic.
writeFileSync(
  ".signal-tmp/track-signal.mts",
  readFileSync("src/lib/track-signal.ts", "utf8").replace(/^import "server-only";\n/m, ""),
);
writeFileSync(".signal-tmp/run.mts", `
import { learnerSignal } from "./track-signal.mjs";
const [, , userId, trackId, pos] = process.argv;
console.log(JSON.stringify(await learnerSignal(userId, trackId, Number(pos))));
`);

const signalFor = (trackId, pos) => {
  const out = execFileSync("npx", ["tsx", ".signal-tmp/run.mts", userId, trackId, String(pos)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.trim().split("\n").pop());
};

/** Build a track whose lessons already have the given outcomes. */
async function track(outcomes) {
  const trackId = randomUUID();
  await c.execute({
    sql: `insert into language_tracks (id, user_id, target_language, known_languages, job_title, status, created_at)
          values (?,?,?,?,?,?,?)`,
    args: [trackId, userId, "python", JSON.stringify(["ruby"]), "Backend Engineer", "ready", now],
  });
  for (const [i, o] of outcomes.entries()) {
    const lessonId = randomUUID();
    await c.execute({
      sql: `insert into track_lessons (id, track_id, position, title, relevance, estimated_minutes, body, verified_at, created_at)
            values (?,?,?,?,?,?,?,?,?)`,
      args: [lessonId, trackId, i + 1, `Lesson ${i + 1}`, "because", 8,
             JSON.stringify({ hints: ["a", "b", "c"] }), now, now],
    });
    if (o) {
      await c.execute({
        sql: `insert into track_progress (user_id, lesson_id, status, hints_used, solution_revealed, attempts, updated_at)
              values (?,?,?,?,?,?,?)`,
        args: [userId, lessonId, o.done === false ? "started" : "complete",
               o.hints ?? 0, o.revealed ? 1 : 0, o.attempts ?? 1, now],
      });
    }
  }
  return trackId;
}

try {
  const clean = { attempts: 1, hints: 0 };

  check("no history at all -> unknown, and generation proceeds normally",
        signalFor(await track([null, null, null]), 1).pace === "unknown");

  check("first lesson of a track -> unknown even if later ones were touched",
        signalFor(await track([{ attempts: 9, hints: 3 }, clean]), 1).pace === "unknown");

  check("clean run -> flying",
        signalFor(await track([clean, clean, clean, clean, null]), 5).pace === "flying");

  check("one hint across four lessons is still flying",
        signalFor(await track([clean, { attempts: 1, hints: 1 }, clean, clean, null]), 5).pace === "flying");

  check("two hints a lesson -> struggling",
        signalFor(await track([{ attempts: 2, hints: 2 }, { attempts: 2, hints: 2 }, null]), 3).pace === "struggling");

  check("four attempts a lesson -> struggling",
        signalFor(await track([{ attempts: 4, hints: 0 }, { attempts: 4, hints: 0 }, null]), 3).pace === "struggling");

  // The one that matters: giving up looks effortless if you only average attempts.
  const quitter = signalFor(await track([
    { attempts: 1, hints: 0, done: false }, { attempts: 1, hints: 0, done: false }, clean, null]), 4);
  check("quietly abandoning two lessons -> struggling, not flying",
        quitter.pace === "struggling", quitter.pace);

  const readIt = signalFor(await track([
    { attempts: 1, hints: 0, revealed: true }, { attempts: 1, hints: 0, revealed: true }, null]), 3);
  check("reading the solution twice -> struggling despite one attempt each",
        readIt.pace === "struggling", readIt.pace);
  check("...and those lessons are named for revisiting",
        readIt.revealed.length === 2, JSON.stringify(readIt.revealed));

  check("a middling run -> steady",
        signalFor(await track([{ attempts: 3, hints: 1 }, { attempts: 2, hints: 1 }, null]), 3).pace === "steady");

  // Only the last four count, so an early rough patch stops dragging forever.
  const recovered = signalFor(await track([
    { attempts: 8, hints: 3, revealed: true }, { attempts: 8, hints: 3, revealed: true },
    clean, clean, clean, clean, null]), 7);
  check("an early rough patch does not follow you for the whole track",
        recovered.pace === "flying", recovered.pace);
  check("...but the concepts you had to be shown are still remembered",
        recovered.revealed.length === 2, JSON.stringify(recovered.revealed));

  const s = signalFor(await track([clean, clean, null]), 3);
  check("the learner is told what it adapted to", Boolean(s.summary), s.summary);
  check("only the recent window is sent to the model", s.recent.length === 2, `${s.recent.length}`);
} finally {
  rmSync(".signal-tmp", { recursive: true, force: true });
  await c.execute({ sql: "delete from users where id = ?", args: [userId] });
}

console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
