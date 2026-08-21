/**
 * Contract tests for the language-track API, run against a dev server.
 *
 *   npm run dev            # in another terminal
 *   npm run test:tracks
 *
 * What these actually protect: that nobody can read another person's track,
 * that a hint or solution is never handed over before it is paid for, that the
 * same hint is never charged twice, and that a generation that fails takes no
 * gems with it. Those are the four ways this feature could quietly cheat
 * someone, so they are the four things asserted here.
 *
 * Creates two throwaway users and deletes them again, including on failure.
 */
import { connectChecked } from "./db.mjs";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const B = "http://localhost:3000";
const c = await connectChecked();
const now = Math.floor(Date.now() / 1000);

async function makeUser(email) {
  const id = randomUUID();
  await c.execute({
    sql: "insert into users (id, email, display_name, password_hash, role, gem_balance, created_at) values (?,?,?,?,?,?,?)",
    args: [id, email, "E2E", await hash("Correct-Horse-9"), "user", 0, now],
  });
  return id;
}

async function signIn(email) {
  const jar = new Map();
  const keep = (res) => {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [kv] = sc.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${B}/api/auth/csrf`);
  keep(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${B}/api/auth/callback/password`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ email, password: "Correct-Horse-9", csrfToken, callbackUrl: B }),
  });
  keep(res);
  return cookie;
}

const post = (cookie, path, body) =>
  fetch(B + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookie() },
    body: JSON.stringify(body ?? {}),
  });

let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};

const emailA = `e2e-a-${Date.now()}@aptivus.test`;
const emailB = `e2e-b-${Date.now()}@aptivus.test`;
const idA = await makeUser(emailA);
const idB = await makeUser(emailB);

try {
  const A = await signIn(emailA);
  const who = await (await fetch(`${B}/api/auth/session`, { headers: { cookie: A() } })).json();
  check("signed in", who?.user?.email === emailA, who?.user?.email ?? "no session");

  // 1. body validation
  let r = await post(A, "/api/tracks", { targetLanguage: "python", jobTitle: "x" });
  check("short job title rejected", r.status === 400, `${r.status}`);

  r = await post(A, "/api/tracks", { targetLanguage: "cobol", jobTitle: "Backend Engineer" });
  check("unrunnable language rejected", r.status === 400, `${r.status}`);

  // 2. the gem wall, before any model call is made
  r = await post(A, "/api/tracks", { targetLanguage: "python", jobTitle: "Senior Backend Engineer" });
  let body = await r.json();
  check("no gems -> 402 and no model call", r.status === 402, `${r.status} ${body.error ?? ""}`);

  // 3. a user whose only language IS the target has nothing to compare against
  await c.execute({ sql: "update users set gem_balance = 50 where id = ?", args: [idA] });
  await c.execute({
    sql: "insert into profiles (user_id, primary_language, expertise) values (?,?,?)",
    args: [idA, "python", JSON.stringify([{ language: "python", level: "expert" }])],
  });
  r = await post(A, "/api/tracks", { targetLanguage: "python", jobTitle: "Senior Backend Engineer" });
  body = await r.json();
  check("nothing to compare against -> refused, not a roadmap comparing Python to Python",
        r.status === 422 && /already know/i.test(body.error ?? ""), `${r.status} ${body.error ?? ""}`);

  // 4. with a real prior language, generation is actually reached
  await c.execute({
    sql: "update profiles set expertise = ? where user_id = ?",
    args: [JSON.stringify([{ language: "ruby", level: "expert" }]), idA],
  });
  r = await post(A, "/api/tracks", { targetLanguage: "python", jobTitle: "Senior Backend Engineer, payments" });
  body = await r.json();
  const unconfigured = r.status === 422 && /not switched on/i.test(body.error ?? "");
  const created = r.status === 201 && body.trackId;
  check("generation reached (422 unconfigured or 201 created)", unconfigured || created,
        `${r.status} ${body.error ?? body.trackId ?? ""}`);

  if (unconfigured) {
    const [{ gem_balance }] = (await c.execute({ sql: "select gem_balance from users where id = ?", args: [idA] })).rows;
    check("a failed generation charges nothing", Number(gem_balance) === 50, `balance ${gem_balance}`);
  }

  // 4. ownership: B must not be able to touch A's lesson, real id or not
  const trackId = randomUUID();
  const lessonId = randomUUID();
  await c.execute({
    sql: "insert into language_tracks (id, user_id, target_language, known_languages, job_title, status, created_at) values (?,?,?,?,?,?,?)",
    args: [trackId, idA, "python", JSON.stringify(["ruby"]), "Senior Backend Engineer", "ready", now],
  });
  await c.execute({
    sql: "insert into track_lessons (id, track_id, position, title, relevance, estimated_minutes, body, verified_at, created_at) values (?,?,?,?,?,?,?,?,?)",
    args: [lessonId, trackId, 1, "Zero values", "You will read them on day one", 8,
           JSON.stringify({ teaching: "t", func: "twice", scaffold: "def twice(n):\n    pass",
                            solution: "def twice(n):\n    return n*2", hints: ["a","b","c"],
                            tests: [{ args: [2], expected: 4, sample: true }],
                            title: "Zero values", relevance: "r", estimatedMinutes: 8 }),
           now, now],
  });

  const Bc = await signIn(emailB);
  for (const [name, path] of [
    ["read", `/api/tracks/${trackId}/lessons/${lessonId}`],
    ["hint", `/api/tracks/${trackId}/lessons/${lessonId}/hint`],
    ["solution", `/api/tracks/${trackId}/lessons/${lessonId}/solution`],
    ["progress", `/api/tracks/${trackId}/lessons/${lessonId}/progress`],
    ["ask", `/api/tracks/${trackId}/lessons/${lessonId}/ask`],
  ]) {
    const res = await post(Bc, path, { level: 0, question: "what is this about then" });
    check(`another user cannot ${name} it`, res.status === 404, `${res.status}`);
  }

  // 5. A can read it, and gets no hints and no solution unpaid
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}`);
  body = await r.json();
  check("owner reads the lesson", r.status === 200, `${r.status}`);
  check("solution withheld until paid for", body.lesson?.solution === null, JSON.stringify(body.lesson?.solution));
  check("hints withheld until paid for", Array.isArray(body.lesson?.hints) && body.lesson.hints.length === 0,
        JSON.stringify(body.lesson?.hints));
  check("hint count still disclosed", body.lesson?.hintCount === 3, `${body.lesson?.hintCount}`);
  check("tests do reach the browser (this is practice, not assessment)",
        body.lesson?.tests?.length === 1);

  // 6. buying a hint, then not being charged twice for it
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/hint`, { level: 0 });
  body = await r.json();
  check("first hint unlocks", r.status === 200 && body.hint === "a", `${r.status} ${body.hint ?? body.error}`);
  const after1 = (await c.execute({ sql: "select gem_balance from users where id = ?", args: [idA] })).rows[0].gem_balance;
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/hint`, { level: 0 });
  const after2 = (await c.execute({ sql: "select gem_balance from users where id = ?", args: [idA] })).rows[0].gem_balance;
  check("the same hint is never charged twice", r.status === 200 && after1 === after2, `${after1} -> ${after2}`);

  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/hint`, { level: 9 });
  check("out-of-range hint level rejected", r.status === 400, `${r.status}`);

  // 7. progress, and that completion is sticky
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/progress`, { code: "def twice(n):\n    return n*2", complete: true, attempted: true });
  body = await r.json();
  check("progress saves complete", body.status === "complete", JSON.stringify(body));
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/progress`, { code: "broken", attempted: true });
  body = await r.json();
  check("completion is sticky", body.status === "complete", JSON.stringify(body));
  check("attempts accumulate", body.attempts === 2, `${body.attempts}`);

  // 8. the solution, once
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}/solution`);
  body = await r.json();
  check("solution unlocks", r.status === 200 && body.solution?.includes("n*2"), `${r.status}`);
  r = await post(A, `/api/tracks/${trackId}/lessons/${lessonId}`);
  body = await r.json();
  check("re-read now includes what was paid for",
        body.lesson?.solution?.includes("n*2") && body.lesson?.hints?.length === 1,
        `hints ${body.lesson?.hints?.length}`);
} finally {
  await c.execute({ sql: "delete from users where id in (?, ?)", args: [idA, idB] });
}

console.log(fails === 0 ? "\nall checks passed" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
