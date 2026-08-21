/**
 * The transition maps are the one part of the language tracks that is not
 * generated, which is the entire reason to trust them. A malformed one fails
 * to load and the roadmap silently falls back to "the model's own knowledge"
 * with nobody told - so a broken file has to fail the build, loudly, rather
 * than quietly downgrade what the learner is reading.
 *
 * Skips quietly when packages/ is absent, so a deploy of apps/web alone works.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.join("..", "..", "packages", "transitions");
if (!existsSync(DIR)) {
  console.log("transitions: packages/transitions not present, skipping");
  process.exit(0);
}

const FIELDS = ["id", "title", "theirs", "yours", "trap", "severity", "tags"];
const SEVERITIES = new Set(["high", "medium", "low"]);
const LEVELS = new Set(["executed", "reviewed"]);
const problems = [];
let count = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const at = (msg) => problems.push(`${file}: ${msg}`);
  let map;
  try {
    map = JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
  } catch (e) {
    at(`not valid JSON - ${e.message}`);
    continue;
  }

  const [from, to] = file.replace(/\.json$/, "").split("-to-");
  if (!from || !to) { at('filename must be "<from>-to-<to>.json"'); continue; }
  // The filename is how loadTransition() finds the file; the fields are what
  // the prompt says out loud. If they disagree, the prompt lies.
  if (map.from !== from || map.to !== to) {
    at(`says ${map.from} -> ${map.to} but is named ${from} -> ${to}`);
  }
  if (!LEVELS.has(map.verification?.level)) {
    at('verification.level must be "executed" or "reviewed" - it is shown to the learner');
  }
  if (!map.verification?.note?.trim()) at("verification.note is empty");
  if (!map.summary?.trim()) at("summary is empty");
  if (!Array.isArray(map.concepts) || map.concepts.length < 8) {
    at(`${map.concepts?.length ?? 0} concepts - too thin to order a roadmap from`);
    continue;
  }

  const seen = new Set();
  for (const c of map.concepts) {
    const missing = FIELDS.filter((f) => !c?.[f]);
    if (missing.length) at(`concept "${c?.id ?? "?"}" is missing ${missing.join(", ")}`);
    if (!SEVERITIES.has(c?.severity)) at(`concept "${c?.id}" has severity "${c?.severity}"`);
    if (seen.has(c?.id)) at(`duplicate concept id "${c.id}"`);
    seen.add(c?.id);
  }
  count++;
}

if (problems.length) {
  console.error(`\ntransitions: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}
console.log(`transitions: ok (${count} maps)`);
