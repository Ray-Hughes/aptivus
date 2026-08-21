/**
 * public/engine.py is a copy of core/engine.py, served to Pyodide in the
 * browser. If the two drift, the browser and the CLI stop agreeing about what
 * a trace looks like - which is exactly the parity the project rests on.
 *
 * Fails the build when they differ. Skips quietly if core/ is not present,
 * so a deploy that only ships apps/web still works.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, copyFileSync } from "node:fs";

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
