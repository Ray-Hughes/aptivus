/**
 * Demo data so the admin panel has something real to show.
 *
 * Idempotent: re-running tops the data up rather than duplicating it. Every
 * gem balance is derived from the ledger rows this script writes, never set
 * independently - the panel enforces the same rule, and demo data that broke it
 * would be the first thing to make a reviewer distrust the numbers.
 *
 *   node scripts/seed-demo.mjs
 */
import { createClient } from "@libsql/client";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:aptivus.db" });
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

/* Deterministic PRNG so two runs on a fresh database look the same. */
let seed = 0x9e3779b9;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const one = async (sql, args = []) => (await c.execute({ sql, args })).rows[0] ?? null;
const all = async (sql, args = []) => (await c.execute({ sql, args })).rows;
const run = (sql, args = []) => c.execute({ sql, args });

/* ------------------------------------------------------------------ */
/* fallback content, only if the tables are empty                      */
/* ------------------------------------------------------------------ */

const COMPANY_SEED = [
  ["federato", "Federato", "Insurtech", { loop: ["recruiter", "45m SQL + DS&A", "onsite"], patterns: ["hash map", "sorting", "windowing"] }],
  ["stripe", "Stripe", "Payments", { loop: ["phone screen", "integration round", "onsite"], patterns: ["api design", "idempotency"] }],
  ["datadog", "Datadog", "Observability", { loop: ["screen", "systems", "onsite"], patterns: ["streams", "aggregation"] }],
  ["gitlab", "GitLab", "DevOps", { loop: ["async take-home", "pairing"], patterns: ["graphs", "parsing"] }],
  ["anthropic", "Anthropic", "AI", { loop: ["screen", "practical", "onsite"], patterns: ["text processing", "evaluation"] }],
];

const PROBLEM_SEED = [
  ["two-sum-premium", "Two Sum: premium accounts", "general", "python", "easy", "hash map", 12],
  ["top-k-brokers", "Top K brokers by written premium", "federato", "python", "medium", "heap", 20],
  ["group-anagrams", "Group anagrams", "general", "python", "medium", "hash map", 18],
  ["balanced-brackets", "Balanced brackets", "general", "python", "easy", "stack", 12],
  ["reconcile-feeds", "Reconcile two policy feeds", "federato", "python", "medium", "two pointers", 22],
  ["longest-unique-run", "Longest run of unique claims", "general", "python", "medium", "sliding window", 20],
  ["merge-intervals", "Merge coverage intervals", "federato", "python", "medium", "sorting", 20],
  ["binary-search-rate", "Binary search a rate table", "general", "python", "easy", "binary search", 15],
  ["broker-hierarchy", "Broker hierarchy rollup", "federato", "python", "hard", "trees", 30],
  ["workflow-order", "Underwriting workflow order", "federato", "python", "hard", "topological sort", 30],
  ["quotes-by-state", "Quotes by state and month", "federato", "sql", "medium", "group by", 15],
  ["loss-ratio-window", "Rolling loss ratio", "federato", "sql", "hard", "window functions", 25],
];

async function ensureContent() {
  const companyCount = Number((await one("select count(*) n from companies")).n);
  if (companyCount === 0) {
    for (const [slug, name, industry, profile] of COMPANY_SEED) {
      await run(
        `insert into companies (id, slug, name, industry, profile, is_published, created_at)
         values (?, ?, ?, ?, ?, 1, ?) on conflict(slug) do nothing`,
        [randomUUID(), slug, name, industry, JSON.stringify(profile), NOW - 60 * DAY],
      );
    }
    console.log(`companies: seeded ${COMPANY_SEED.length}`);
  } else {
    console.log(`companies: ${companyCount} already present, left alone`);
  }

  const problemCount = Number((await one("select count(*) n from problems")).n);
  if (problemCount === 0) {
    const companies = await all("select id, slug from companies");
    const bySlug = new Map(companies.map((r) => [r.slug, r.id]));
    for (const [slug, title, pack, kind, difficulty, pattern, minutes] of PROBLEM_SEED) {
      const body = {
        prompt: `${title}. Written for the ${pack} pack.`,
        signature: kind === "sql" ? "-- write a single SELECT" : "def solve(rows):",
        hints: [
          "What is the shape of the input?",
          `The intended pattern is ${pattern}.`,
          "Handle the empty input before anything else.",
        ],
        tests: [
          { name: "empty", input: [], expected: [] },
          { name: "typical", input: [1, 2, 3], expected: [1, 2, 3] },
        ],
        bindings: { python: { entry: "solve" } },
      };
      await run(
        `insert into problems (id, slug, pack, company_id, kind, title, difficulty, pattern,
                               minutes, body, source, is_published, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'curated', 1, ?)
         on conflict(slug) do nothing`,
        [
          randomUUID(), slug, pack, bySlug.get(pack) ?? null, kind, title, difficulty,
          pattern, minutes, JSON.stringify(body), NOW - between(20, 80) * DAY,
        ],
      );
    }
    console.log(`problems: seeded ${PROBLEM_SEED.length}`);
  } else {
    console.log(`problems: ${problemCount} already present, left alone`);
  }
}

/* ------------------------------------------------------------------ */
/* demo users                                                          */
/* ------------------------------------------------------------------ */

const PEOPLE = [
  ["Ada Okafor", "ada.okafor"], ["Ben Halloran", "ben.halloran"],
  ["Chen Wei", "chen.wei"], ["Dara Mensah", "dara.mensah"],
  ["Elif Demir", "elif.demir"], ["Farid Haddad", "farid.haddad"],
  ["Grace Lindqvist", "grace.lindqvist"], ["Hiro Tanaka", "hiro.tanaka"],
  ["Ines Moreau", "ines.moreau"], ["Jonas Vermeer", "jonas.vermeer"],
  ["Kavya Iyer", "kavya.iyer"], ["Liam Doherty", "liam.doherty"],
  ["Maya Rosenthal", "maya.rosenthal"], ["Nikolai Petrov", "nikolai.petrov"],
  ["Olu Adeyemi", "olu.adeyemi"], ["Priya Raman", "priya.raman"],
  ["Quinn Alvarez", "quinn.alvarez"], ["Rosa Bianchi", "rosa.bianchi"],
  ["Samir Qureshi", "samir.qureshi"], ["Tove Lindberg", "tove.lindberg"],
  ["Ugo Bassi", "ugo.bassi"], ["Vera Kowalski", "vera.kowalski"],
  ["Wes Carmichael", "wes.carmichael"], ["Yuki Nakamura", "yuki.nakamura"],
];

const TIMEZONES = ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo", "Europe/Berlin"];
const ROLES = ["Backend engineer", "Full stack engineer", "Forward deployed engineer", "Data engineer"];
const ROUNDS = ["phone screen", "technical screen", "onsite", "final"];
const LEVELS = ["junior", "mid", "senior", "staff"];
const LANGUAGES = ["python", "python", "python", "javascript", "sql"];

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "aptivus-demo-2026";

async function seedUsers(companySlugs) {
  const digest = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const ids = [];

  for (const [index, [name, handle]] of PEOPLE.entries()) {
    const email = `${handle}@example.com`;
    const existing = await one("select id from users where email = ?", [email]);
    if (existing) {
      ids.push(String(existing.id));
      continue;
    }

    const id = randomUUID();
    const createdAt = NOW - between(1, 90) * DAY;
    // A couple of soft-deleted accounts so the Deleted filter has something.
    const deletedAt = index === 21 || index === 22 ? createdAt + 5 * DAY : null;

    await run(
      `insert into users (id, email, email_verified_at, password_hash, display_name, image,
                          role, timezone, gem_balance, created_at, last_seen_at, deleted_at)
       values (?, ?, ?, ?, ?, null, 'user', ?, 0, ?, ?, ?)`,
      [
        id, email, rnd() > 0.15 ? createdAt + 600 : null, digest, name,
        pick(TIMEZONES), createdAt,
        deletedAt ? null : NOW - between(0, 6) * DAY, deletedAt,
      ],
    );

    await run(
      `insert into profiles (user_id, target_company, target_role, target_round,
                             experience_level, primary_language, interview_date)
       values (?, ?, ?, ?, ?, ?, ?) on conflict(user_id) do nothing`,
      [
        id, pick(companySlugs), pick(ROLES), pick(ROUNDS), pick(LEVELS),
        pick(LANGUAGES), rnd() > 0.5 ? NOW + between(3, 45) * DAY : null,
      ],
    );

    ids.push(id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* subscriptions, ledger, attempts, achievements                       */
/* ------------------------------------------------------------------ */

async function seedSubscriptions(userIds) {
  let made = 0;
  for (const [index, userId] of userIds.entries()) {
    const existing = await one("select user_id from subscriptions where user_id = ?", [userId]);
    if (existing) continue;

    const roll = rnd();
    let status = "none";
    let plan = "free";
    if (index % 4 === 0) { status = "active"; plan = "pro"; }
    else if (roll > 0.88) { status = "trialing"; plan = "pro"; }
    else if (roll > 0.82) { status = "past_due"; plan = "pro"; }
    else if (roll > 0.74) { status = "canceled"; plan = "free"; }
    if (status === "none") continue;

    await run(
      `insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id,
                                  status, plan, current_period_end, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, `cus_demo_${userId.slice(0, 8)}`, `sub_demo_${userId.slice(0, 8)}`,
        status, plan,
        status === "canceled" ? NOW - between(1, 20) * DAY : NOW + between(2, 30) * DAY,
        NOW - between(0, 30) * DAY,
      ],
    );
    made += 1;
  }
  return made;
}

/**
 * Ledger and cached balance move together, always. The balance written here is
 * literally the sum of the rows written here.
 */
async function seedLedgerAndBalances(userIds) {
  let rows = 0;
  for (const userId of userIds) {
    const already = await one("select count(*) n from gem_ledger where user_id = ?", [userId]);
    if (Number(already.n) > 0) continue;

    const entries = [];
    if (rnd() > 0.35) {
      entries.push([60, "purchase", "pack_60", NOW - between(20, 70) * DAY]);
    }
    for (let i = 0; i < between(1, 6); i += 1) {
      entries.push([pick([2, 4, 6]), "earn", `clean_solve_${pick(["easy", "medium", "hard"])}`, NOW - between(1, 60) * DAY]);
    }
    for (let i = 0; i < between(0, 6); i += 1) {
      entries.push([-pick([1, 1, 3]), "spend", pick(["hint", "solution"]), NOW - between(0, 45) * DAY]);
    }
    if (rnd() > 0.85) {
      entries.push([25, "grant", "admin:launch goodwill", NOW - between(5, 40) * DAY]);
    }

    entries.sort((a, b) => a[3] - b[3]);

    // Never let the demo data show a balance the ledger cannot explain.
    let balance = 0;
    const kept = [];
    for (const entry of entries) {
      if (balance + entry[0] < 0) continue;
      balance += entry[0];
      kept.push(entry);
    }

    const tx = await c.transaction("write");
    try {
      for (const [delta, kind, reason, createdAt] of kept) {
        await tx.execute({
          sql: `insert into gem_ledger (id, user_id, delta, kind, reason, created_at)
                values (?, ?, ?, ?, ?, ?)`,
          args: [randomUUID(), userId, delta, kind, reason, createdAt],
        });
      }
      await tx.execute({
        sql: "update users set gem_balance = ? where id = ?",
        args: [balance, userId],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
    rows += kept.length;
  }
  return rows;
}

async function seedAttempts(userIds, problems) {
  if (problems.length === 0) return 0;
  let rows = 0;
  for (const userId of userIds) {
    const already = await one("select count(*) n from attempts where user_id = ?", [userId]);
    if (Number(already.n) > 2) continue;

    for (let i = 0; i < between(0, 9); i += 1) {
      const problem = pick(problems);
      const solved = rnd() > 0.35;
      const total = between(4, 12);
      const hintLevel = rnd() > 0.7 ? between(1, 3) : 0;
      await run(
        `insert into attempts (id, user_id, problem_id, language, status, code,
                               tests_passed, tests_total, hint_level_used,
                               solution_revealed, duration_ms, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), userId, String(problem.id),
          problem.kind === "sql" ? "sql" : "python",
          solved ? "solved" : "tried",
          "# submitted from the practice workbench\n",
          solved ? total : between(0, total - 1), total, hintLevel,
          !solved && rnd() > 0.75 ? 1 : 0,
          between(45_000, 1_800_000), NOW - between(0, 60) * DAY,
        ],
      );
      rows += 1;
    }
  }
  return rows;
}

async function seedAchievements(userIds) {
  const badges = await all("select id from achievements");
  if (badges.length === 0) return 0;
  let rows = 0;
  for (const userId of userIds) {
    for (const badge of badges) {
      if (rnd() > 0.22) continue;
      const earned = rnd() > 0.4;
      const result = await run(
        `insert into user_achievements (user_id, achievement_id, progress, earned_at)
         values (?, ?, ?, ?) on conflict(user_id, achievement_id) do nothing`,
        [
          userId, String(badge.id),
          earned ? 1 : Math.round(rnd() * 90) / 100,
          earned ? NOW - between(1, 50) * DAY : null,
        ],
      );
      rows += result.rowsAffected ?? 0;
    }
  }
  return rows;
}

/** A little history so the Audit Log page is not blank on first load. */
async function seedAuditHistory(adminId, userIds) {
  const already = await one("select count(*) n from audit_log");
  if (Number(already.n) > 0 || !adminId) return 0;

  const entries = [
    ["flag.update", "feature_flag", "gems", { before: { enabled: false, rolloutPercent: 0 }, after: { enabled: true, rolloutPercent: 100 } }],
    ["flag.update", "feature_flag", "company_packs", { before: { enabled: false, rolloutPercent: 0 }, after: { enabled: true, rolloutPercent: 100 } }],
    ["company.publish", "company", null, { slug: "federato" }],
    ["user.grant_gems", "user", userIds[0] ?? null, { delta: 25, reason: "launch goodwill" }],
    ["problem.publish", "problem", null, { slug: "merge-intervals" }],
  ];

  for (const [index, [action, targetType, targetId, meta]] of entries.entries()) {
    await run(
      `insert into audit_log (id, actor_user_id, action, target_type, target_id, meta, ip, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), adminId, action, targetType, targetId,
        JSON.stringify({ ...meta, seeded: true }), "127.0.0.1",
        NOW - (entries.length - index) * DAY,
      ],
    );
  }
  return entries.length;
}

/* ------------------------------------------------------------------ */

await ensureContent();

const companySlugs = (await all("select slug from companies")).map((r) => String(r.slug));
const problems = (await all("select id, kind from problems where is_published = 1 limit 200"))
  .map((r) => ({ id: r.id, kind: r.kind }));

const userIds = await seedUsers(companySlugs.length ? companySlugs : ["federato"]);
console.log(`users: ${userIds.length} demo accounts (password: ${DEMO_PASSWORD})`);

console.log(`subscriptions: +${await seedSubscriptions(userIds)}`);
console.log(`gem_ledger: +${await seedLedgerAndBalances(userIds)} rows, balances rewritten from them`);
console.log(`attempts: +${await seedAttempts(userIds, problems)}`);
console.log(`user_achievements: +${await seedAchievements(userIds)}`);

const admin = await one("select id from users where role = 'admin' order by created_at limit 1");
console.log(`audit_log: +${await seedAuditHistory(admin ? String(admin.id) : null, userIds)}`);

/**
 * seed.mjs gives the admin an opening balance of 100 gems without a ledger row.
 * Write the row that explains it rather than leaving the panel showing a
 * balance nothing accounts for.
 */
const unexplained = await all(`
  select u.id, u.email, u.gem_balance,
         coalesce((select sum(delta) from gem_ledger l where l.user_id = u.id), 0) as ledger
  from users u
  where u.gem_balance <> coalesce((select sum(delta) from gem_ledger l where l.user_id = u.id), 0)
`);
for (const row of unexplained) {
  const delta = Number(row.gem_balance) - Number(row.ledger);
  await run(
    `insert into gem_ledger (id, user_id, delta, kind, reason, created_at)
     values (?, ?, ?, 'grant', 'seed:opening_balance', ?)`,
    [randomUUID(), String(row.id), delta, NOW - 90 * DAY],
  );
  console.log(`gem_ledger: wrote opening balance ${delta} for ${row.email}`);
}

const drift = await all(`
  select u.id, u.email, u.gem_balance,
         coalesce((select sum(delta) from gem_ledger l where l.user_id = u.id), 0) as ledger
  from users u
  where u.gem_balance <> coalesce((select sum(delta) from gem_ledger l where l.user_id = u.id), 0)
`);
if (drift.length) {
  console.log(`WARNING: ${drift.length} users whose cached balance differs from their ledger:`);
  for (const row of drift) console.log(`  ${row.email}: cached ${row.gem_balance}, ledger ${row.ledger}`);
} else {
  console.log("balance check: every cached balance equals the sum of its ledger rows");
}
