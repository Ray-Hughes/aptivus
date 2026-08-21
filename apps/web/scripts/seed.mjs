import { createClient } from "@libsql/client";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const c = createClient({ url: process.env.DATABASE_URL ?? "file:aptivus.db" });
const now = Math.floor(Date.now() / 1000);

const FLAGS = [
  ["billing", "Stripe subscriptions and gem packs", 0, 0],
  ["gems", "Gem earning and spending", 1, 100],
  ["generated_problems", "AI-generated problems for a target company", 0, 0],
  ["company_packs", "Company-targeted problem packs", 1, 100],
  ["achievements", "Badges, streaks and rewards", 1, 100],
  ["multi_language", "JavaScript and Ruby adapters", 0, 0],
  ["admin_panel", "Admin area", 1, 100],
];
for (const [key, description, enabled, rollout] of FLAGS) {
  await c.execute({
    sql: `INSERT INTO feature_flags (key, description, enabled, rollout_percent, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET description = excluded.description`,
    args: [key, description, enabled, rollout, now],
  });
}

const ACHIEVEMENTS = [
  ["first-blood", "First Blood", "Solve your first problem", "🎯", "bronze", 2],
  ["clean-sweep", "Clean Sweep", "Solve 5 problems without a single hint", "✨", "silver", 10],
  ["sql-slinger", "SQL Slinger", "Solve every SQL problem in a pack", "🗃️", "gold", 25],
  ["streak-7", "Seven Day Streak", "Practise seven days in a row", "🔥", "silver", 10],
  ["streak-30", "Thirty Day Streak", "Practise thirty days in a row", "🌋", "gold", 50],
  ["night-owl", "Night Owl", "Solve a problem after midnight", "🦉", "bronze", 2],
  ["speed-demon", "Speed Demon", "Solve a medium problem inside its target time", "⚡", "silver", 8],
  ["debugger", "Debugger", "Step through a trace 50 times", "🔬", "bronze", 5],
  ["pattern-master", "Pattern Master", "Solve a problem in every pattern", "🧩", "gold", 40],
  ["interview-ready", "Interview Ready", "Complete a full 45 minute mock", "🎓", "gold", 30],
];
for (const [slug, name, description, icon, tier, gem] of ACHIEVEMENTS) {
  await c.execute({
    sql: `INSERT INTO achievements (id, slug, name, description, icon, tier, gem_reward)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING`,
    args: [randomUUID(), slug, name, description, icon, tier, gem],
  });
}

// Admin account. There is deliberately no admin signup route.
const email = (process.env.ADMIN_EMAIL ?? "r.hughes2136@gmail.com").toLowerCase();
// A known default password on a deployed admin account is an open door, so
// the fallback only exists off localhost when explicitly forced.
const isProd = process.env.NODE_ENV === "production" || process.env.APTIVUS_ENV === "production";
if (isProd && !process.env.ADMIN_PASSWORD) {
  console.error("refusing to seed: set ADMIN_PASSWORD (no default outside development)");
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD ?? "aptivus-dev-admin-2026";
const digest = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const existing = await c.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
if (existing.rows.length) {
  await c.execute({
    sql: "UPDATE users SET role='admin', password_hash=?, email_verified_at=? WHERE email=?",
    args: [digest, now, email],
  });
  console.log("admin updated:", email);
} else {
  await c.execute({
    sql: `INSERT INTO users (id, email, email_verified_at, password_hash, display_name, role, gem_balance, created_at)
          VALUES (?, ?, ?, ?, ?, 'admin', 100, ?)`,
    args: [randomUUID(), email, now, digest, "Raymond", now],
  });
  console.log("admin created:", email);
}
console.log("password:", password);
console.log(`flags: ${FLAGS.length}, achievements: ${ACHIEVEMENTS.length}`);
