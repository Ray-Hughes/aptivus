#!/usr/bin/env node
/**
 * Smoke test a deployed Aptivus:  node scripts/smoke.mjs https://host
 *
 * Covers the things that only break in production - HTTPS callbacks, a hosted
 * database, cold starts, and anything private that is not.
 */
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) { console.error("usage: node scripts/smoke.mjs https://host"); process.exit(1); }

let pass = 0, fail = 0;
const ok  = (n, d = "") => { pass++; console.log(`  ok    ${n}${d ? "  " + d : ""}`); };
const bad = (n, d = "") => { fail++; console.log(`  FAIL  ${n}${d ? "  " + d : ""}`); };

async function get(path, opts = {}) {
  const res = await fetch(base + path, { redirect: "manual", ...opts });
  const body = await res.text().catch(() => "");
  return { status: res.status, location: res.headers.get("location"), body, res };
}

console.log(`\nsmoke testing ${base}\n`);

{ const t0 = Date.now(); const r = await get("/"); const ms = Date.now() - t0;
  r.status === 200 ? ok("landing page", `${r.status} in ${ms}ms`) : bad("landing page", String(r.status)); }

for (const p of ["/signin", "/signup", "/forgot"]) {
  const r = await get(p);
  r.status === 200 ? ok(`${p} renders`) : bad(`${p} renders`, String(r.status));
}

for (const p of ["/dashboard", "/settings", "/admin"]) {
  const r = await get(p);
  [302, 307, 401, 403].includes(r.status)
    ? ok(`${p} protected`, `${r.status}${r.location ? " -> " + r.location.replace(base, "") : ""}`)
    : bad(`${p} protected`, `got ${r.status}`);
}

{ const r = await get("/api/problems");
  if (r.status !== 200) bad("problem list", `${r.status} - hosted database reachable?`);
  else { try { const d = JSON.parse(r.body); const n = (d.problems ?? d).length ?? 0;
    n >= 30 ? ok("problem list", `${n} problems`) : bad("problem list", `only ${n} - did the import run?`);
  } catch { bad("problem list", "not JSON"); } } }

{ const r = await get("/api/problems/py_01_two_sum_premium");
  if (r.status !== 200) bad("problem payload", String(r.status));
  else { const leaks = [];
    if (/"solution"\s*:/.test(r.body)) leaks.push("solution");
    if (/"hints"\s*:\s*\[[^\]]/.test(r.body)) leaks.push("hints");
    leaks.length ? bad("no secrets in payload", leaks.join(", ")) : ok("no secrets in payload"); } }

for (const [p, method] of [["/api/problems/py_01_two_sum_premium/hint", "POST"],
                           ["/api/problems/py_01_two_sum_premium/tests", "GET"]]) {
  const r = await get(p, { method, headers: { "Content-Type": "application/json" },
                           body: method === "POST" ? JSON.stringify({ level: 0 }) : undefined });
  [401, 403].includes(r.status) ? ok(`${p.split("/").pop()} requires auth`, String(r.status))
                                : bad(`${p.split("/").pop()} requires auth`, `got ${r.status}`); }

for (const p of ["/engine.py", "/engine-worker.js"]) {
  const r = await get(p);
  r.status === 200 && r.body.length > 500 ? ok(`${p} served`, `${(r.body.length/1024).toFixed(1)}kb`)
    : bad(`${p} served`, `${r.status}, ${r.body.length}b - in-browser runtime will not boot`); }

{ const r = await get("/");
  r.res.headers.get("strict-transport-security") ? ok("HSTS set") : bad("HSTS set", "missing"); }

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
