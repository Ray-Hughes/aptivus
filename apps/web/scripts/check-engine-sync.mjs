/**
 * Two parity checks the whole project rests on, both run before every build.
 *
 * 1. public/engine.py is a copy of core/engine.py, served to Pyodide in the
 *    browser. If the two drift, the browser and the CLI stop agreeing about
 *    what a trace looks like.
 *
 * 2. The pyodide npm package and the CDN URL in public/engine-worker.js must
 *    be the same version. The server uses the npm one to verify that a
 *    generated lesson's own solution passes its own tests; the learner runs
 *    the CDN one. When they drifted apart we were certifying lessons against
 *    Python 3.14 and running them on 3.12, which makes the verification
 *    gate a decoration.
 *
 * Skips quietly if core/ is not present, so a deploy that only ships
 * apps/web still works.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, copyFileSync } from "node:fs";

/* ---- 2. pyodide version parity ----------------------------------- */
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = (pkg.dependencies?.pyodide ?? "").replace(/^[\^~]/, "");
const worker = readFileSync("public/engine-worker.js", "utf8");
const fromCdn = worker.match(/pyodide\/v([\d.]+)\/full/)?.[1];

if (!declared || !fromCdn) {
  console.error("\npyodide sync: could not read both versions " +
    `(package.json: ${declared || "none"}, engine-worker.js: ${fromCdn || "none"}).\n`);
  process.exit(1);
}
if (declared !== fromCdn) {
  console.error(
    `\npyodide sync: package.json pins ${declared} but public/engine-worker.js loads ${fromCdn}.\n` +
      "Lessons would be verified on one Python and run on another. Set both to the same version.\n",
  );
  process.exit(1);
}
console.log(`pyodide sync: ok (${declared})`);

/* ---- 1. engine.py parity ----------------------------------------- */
const CANON = "../../core/engine.py";
const COPY = "public/engine.py";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);

if (!existsSync(CANON)) {
  console.log("engine sync: core/engine.py not present, skipping");
  process.exit(0);
}
if (!existsSync(COPY)) {
  copyFileSync(CANON, COPY);
  console.log("engine sync: public/engine.py was missing, copied");
  process.exit(0);
}
const a = sha(CANON);
const b = sha(COPY);
if (a === b) {
  console.log(`engine sync: ok (${a})`);
  process.exit(0);
}
if (process.env.FIX_ENGINE_SYNC === "1") {
  copyFileSync(CANON, COPY);
  console.log(`engine sync: updated public/engine.py ${b} -> ${a}`);
  process.exit(0);
}
console.error(
  `\nengine sync: public/engine.py (${b}) does not match core/engine.py (${a}).\n` +
    "The browser would run different code from the CLI. Re-copy it:\n" +
    "  FIX_ENGINE_SYNC=1 node scripts/check-engine-sync.mjs\n",
);
process.exit(1);
