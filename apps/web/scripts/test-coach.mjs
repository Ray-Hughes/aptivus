/**
 * Contract tests for the practice-view Ask route, against a dev server.
 *
 *   npm run dev            # in another terminal
 *   npm run test:coach
 *
 * The one that matters is the mock-round lock. The pre-round screen promises
 * no help during a round; if Ask still answered, that promise would be false
 * and the Hint button's careful enforcement would be theatre. A loophole with
 * a friendlier name is still a loophole.
 */
import { connectChecked } from "./db.mjs";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const B = "http://localhost:3000";
const c = await connectChecked();
const now = Math.floor(Date.now() / 1000);

let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};

const email = `coach-${Date.now()}@aptivus.test`;
const userId = randomUUID();
await c.execute({
  sql: "insert into users (id, email, display_name, password_hash, role, gem_balance, created_at) values (?,?,?,?,?,?,?)",
  args: [userId, email, "Coach E2E", await hash("Correct-Horse-9"), "user", 0, now],
});

const jar = new Map();
const keep = (res) => {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [kv] = sc.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const post = (path, body, withCookie = true) =>
  fetch(B + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(withCookie ? { cookie: cookie() } : {}) },
    body: JSON.stringify(body ?? {}),
  });

try {
  const [problem] = (await c.execute("select id, slug from problems where is_published = 1 limit 1")).rows;

  let r = await post(`/api/problems/${problem.slug}/ask`, { question: "why does this loop" }, false);
  check("anonymous is refused", r.status === 401, `${r.status}`);

  const csrfRes = await fetch(`${B}/api/auth/csrf`);
  keep(csrfRes);
  const { csrfToken } = await csrfRes.json();
  keep(await fetch(`${B}/api/auth/callback/password`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ email, password: "Correct-Horse-9", csrfToken, callbackUrl: B }),
  }));
  const who = await (await fetch(`${B}/api/auth/session`, { headers: { cookie: cookie() } })).json();
  check("signed in", who?.user?.email === email, who?.user?.email ?? "no session");

  r = await post(`/api/problems/no-such-problem/ask`, { question: "why does this loop" });
  check("unknown problem is 404", r.status === 404, `${r.status}`);

  r = await post(`/api/problems/${problem.slug}/ask`, { question: "hm" });
  check("a two-character question is rejected", r.status === 400, `${r.status}`);

  r = await post(`/api/problems/${problem.slug}/ask`, {
    question: "what is this line doing", code: "def solve(): pass",
    at: { line: 1, source: "def solve(): pass", func: "solve", locals: [["n", "3"]] },
  });
  let body = await r.json();
  check("with no key configured it says so rather than half-working",
        r.status === 503 && /not switched on/i.test(body.error ?? ""), `${r.status} ${body.error ?? ""}`);

  // The loophole test.
  const roundId = randomUUID();
  await c.execute({
    sql: "insert into mock_rounds (id, user_id, pack, shape, duration_seconds, status, started_at, created_at) values (?,?,?,?,?,?,?,?)",
    args: [roundId, userId, "default", "single", 2700, "in_progress", now, now],
  });
  await c.execute({
    sql: "insert into mock_round_problems (id, round_id, problem_id, order_index) values (?,?,?,?)",
    args: [randomUUID(), roundId, problem.id, 0],
  });

  r = await post(`/api/problems/${problem.slug}/ask`, { question: "what is this line doing" });
  body = await r.json();
  check("no coaching during a live mock round", r.status === 403, `${r.status} ${body.error ?? ""}`);

  r = await post(`/api/problems/${problem.slug}/hint`, { level: 0 });
  check("...and the hint route agrees, so the two cannot drift apart",
        r.status === 403, `${r.status}`);

  await c.execute({ sql: "update mock_rounds set status = 'complete', ended_at = ? where id = ?", args: [now, roundId] });
  r = await post(`/api/problems/${problem.slug}/ask`, { question: "what is this line doing" });
  check("once the round is over, coaching is available again", r.status === 503, `${r.status}`);
} finally {
  await c.execute({ sql: "delete from users where id = ?", args: [userId] });
}

console.log(fails === 0 ? "\nall checks passed" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
