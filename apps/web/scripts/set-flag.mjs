/**
 * Turn one feature flag on or off, and nothing else.
 *
 *   node scripts/set-flag.mjs <key> on|off [rollout-percent] [description]
 *   node scripts/set-flag.mjs                       # list them
 *
 * Deliberately narrow. The obvious way to get a new flag into production is to
 * run seed.mjs, but that also writes problems, companies, courses and
 * achievements - a far bigger blast radius than "switch this on", against a
 * database with real users in it. This touches exactly one row and prints it
 * before and after.
 */
import { connectChecked } from "./db.mjs";

const [key, state, percent, ...rest] = process.argv.slice(2);
const c = await connectChecked();

const show = async (label) => {
  const r = await c.execute("select key, enabled, rollout_percent from feature_flags order by key");
  console.log(`\n${label}`);
  for (const row of r.rows) {
    console.log(`  ${row.key.padEnd(20)} ${row.enabled ? "on " : "off"}  ${row.rollout_percent}%`);
  }
};

if (!key) {
  await show("feature flags");
  console.log("\nusage: node scripts/set-flag.mjs <key> on|off [rollout-percent] [description]\n");
  process.exit(0);
}
if (state !== "on" && state !== "off") {
  console.error('second argument must be "on" or "off"');
  process.exit(1);
}

const rollout = percent === undefined ? (state === "on" ? 100 : 0) : Number(percent);
if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) {
  console.error("rollout percent must be an integer 0-100");
  process.exit(1);
}

const [before] = (await c.execute({
  sql: "select key, enabled, rollout_percent from feature_flags where key = ?", args: [key],
})).rows;
console.log(before
  ? `before: ${before.key} ${before.enabled ? "on" : "off"} ${before.rollout_percent}%`
  : `before: ${key} does not exist yet`);

await c.execute({
  sql: `insert into feature_flags (key, description, enabled, rollout_percent, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(key) do update set
          enabled = excluded.enabled,
          rollout_percent = excluded.rollout_percent,
          updated_at = excluded.updated_at`,
  args: [key, rest.join(" ") || before?.description || key, state === "on" ? 1 : 0,
         rollout, Math.floor(Date.now() / 1000)],
});

const [after] = (await c.execute({
  sql: "select key, enabled, rollout_percent from feature_flags where key = ?", args: [key],
})).rows;
console.log(`after:  ${after.key} ${after.enabled ? "on" : "off"} ${after.rollout_percent}%`);
