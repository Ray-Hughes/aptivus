/**
 * Run every reference solution against its own tests, in every language it is
 * written in.
 *
 *     node verify.mjs                 # everything
 *     node verify.mjs --lang=javascript
 *     node verify.mjs py_01 sql_04    # id substrings
 *
 * The failure this exists to catch is narrow and specific: **a reference
 * solution that does not satisfy the problem's own stated tests.** That is how
 * a hand-written problem goes subtly wrong, and it is the only way an
 * LLM-generated one ever goes wrong. When the curated library was first
 * assembled this harness caught four wrong expected-values.
 *
 * When it fails, the answer is almost never to edit the test until it passes.
 * Work out which of the two is wrong first.
 *
 * No Python installation is required. Python arrives as a WASM payload
 * (Pyodide) running the very same `core/engine.py` the browser runs, so the
 * verifier, CI and the product all execute learner code identically. SQL runs
 * on SQLite compiled to WASM (sql.js). JavaScript runs in a `node:vm` context.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { languagesOf, loadAllProblems } from "./src/index.mjs";
import { buildJsonSchema, SCHEMA_FILE, serialize } from "./scripts/gen-schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE));
const ENGINE_PY = join(REPO, "core", "engine.py");

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ */
/* comparison - the same rules core/engine.py applies                  */
/* ------------------------------------------------------------------ */

/** Normalize a JavaScript value so it survives a JSON round trip. */
function norm(v) {
  if (v === undefined) return null;
  if (v instanceof Set) return [...v].map(norm).sort(byJson);
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), norm(x)]));
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [String(k), norm(x)]));
  }
  return v;
}

const byJson = (a, b) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/** Deep equality with float tolerance, matching `engine.compare`. */
function deepEqual(got, exp) {
  if (typeof got === "number" && typeof exp === "number") {
    if (Number.isInteger(got) && Number.isInteger(exp)) return got === exp;
    return Math.abs(got - exp) < 1e-6;
  }
  if (Array.isArray(got) || Array.isArray(exp)) {
    if (!Array.isArray(got) || !Array.isArray(exp) || got.length !== exp.length) return false;
    return got.every((g, i) => deepEqual(g, exp[i]));
  }
  if (got && exp && typeof got === "object" && typeof exp === "object") {
    const gk = Object.keys(got).sort();
    const ek = Object.keys(exp).sort();
    if (gk.length !== ek.length || gk.some((k, i) => k !== ek[i])) return false;
    return gk.every((k) => deepEqual(got[k], exp[k]));
  }
  return got === exp;
}

function compare(got, exp, unordered) {
  if (unordered && Array.isArray(got) && Array.isArray(exp)) {
    return deepEqual([...got].sort(byJson), [...exp].sort(byJson));
  }
  return deepEqual(got, exp);
}

const show = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 120 ? `${s.slice(0, 117)}...` : s;
};

/* ------------------------------------------------------------------ */
/* Python, via Pyodide running core/engine.py                          */
/* ------------------------------------------------------------------ */
let pyDispatch = null;

async function pythonAdapter() {
  if (pyDispatch) return pyDispatch;
  if (!existsSync(ENGINE_PY)) throw new Error(`core/engine.py not found at ${ENGINE_PY}`);
  const { loadPyodide } = await import("pyodide");
  const py = await loadPyodide({ stdout: () => {}, stderr: () => {} });
  py.FS.writeFile("/engine.py", readFileSync(ENGINE_PY, "utf8"), { encoding: "utf8" });
  // Payloads cross the boundary as JSON *text* and are parsed on the Python
  // side. JSON has one number type, so letting JavaScript parse it would turn
  // 1.0 into 1 with no way back - and a rate table full of floats is exactly
  // the case that breaks.
  const call = py.runPython(`
import json, sys
sys.path.insert(0, "/")
import engine

def _call(text):
    return json.dumps(engine.dispatch(json.loads(text)))

_call
`);
  pyDispatch = (payload) => JSON.parse(call(JSON.stringify(payload)));
  return pyDispatch;
}

async function runPython(problem, code) {
  const dispatch = await pythonAdapter();
  const out = dispatch({
    op: "run",
    code,
    cases: problem.tests,
    mode: problem.mode,
    func: problem.signature.name.python ?? "",
    unordered: problem.unordered,
  });
  if (out.error) throw new Error(out.error);
  return out.results.map((r, i) => ({
    passed: r.passed,
    got: r.got,
    expected: problem.tests[i].expected,
    error: r.error,
  }));
}

/* ------------------------------------------------------------------ */
/* JavaScript, in a fresh vm context                                   */
/* ------------------------------------------------------------------ */
function runJavaScript(problem, code) {
  if (problem.mode !== "function") {
    throw new Error("the JavaScript adapter only runs function-mode problems");
  }
  const name = problem.signature.name.javascript;
  const context = vm.createContext({ console: { log() {} }, structuredClone });
  let fn;
  try {
    // The assignment lives in the same script so it can see `const`/`let`
    // declarations, which do not become properties of the context's global.
    fn = vm.runInContext(`${code}\n;(${name});`, context, { timeout: 5000 });
  } catch (e) {
    return problem.tests.map((t) => ({
      passed: false, got: null, expected: t.expected, error: `${e.name}: ${e.message}`,
    }));
  }
  if (typeof fn !== "function") {
    return problem.tests.map((t) => ({
      passed: false, got: null, expected: t.expected,
      error: `no function named ${name} was defined`,
    }));
  }
  return problem.tests.map((t) => {
    // Deep-copy the arguments, as the Python engine does, so a solution that
    // mutates its input cannot change what a later test is given.
    const args = structuredClone(t.args ?? []);
    try {
      const got = norm(fn(...args));
      return { passed: compare(got, t.expected, t.unordered || problem.unordered), got, expected: t.expected, error: "" };
    } catch (e) {
      return { passed: false, got: null, expected: t.expected, error: `${e.name}: ${e.message}` };
    }
  });
}

/* ------------------------------------------------------------------ */
/* SQL, on SQLite compiled to WASM                                     */
/* ------------------------------------------------------------------ */
let sqlJs = null;

async function sqlAdapter() {
  if (sqlJs) return sqlJs;
  const initSqlJs = require("sql.js");
  sqlJs = await initSqlJs({
    locateFile: (f) => join(dirname(require.resolve("sql.js")), f),
  });
  return sqlJs;
}

async function runSql(problem) {
  const SQL = await sqlAdapter();
  const db = new SQL.Database();
  const issues = [];
  try {
    db.run(problem.sql.schema);
    db.run(problem.sql.seed);
  } catch (e) {
    db.close();
    return [{ passed: false, error: `schema/seed failed: ${e.message}` }];
  }
  const query = problem.languages.sql.solution;
  let result;
  try {
    result = db.exec(query);
  } catch (e) {
    db.close();
    return [{ passed: false, error: `reference query failed: ${e.message}` }];
  }
  const first = result[0];
  const rows = first?.values ?? [];
  const cols = first?.columns ?? [];

  if (!first) issues.push("reference query returned no result set");
  else if (rows.length === 0) issues.push("reference query returned ZERO rows");
  if (problem.sql.expectedRowCount !== undefined && rows.length !== problem.sql.expectedRowCount) {
    issues.push(
      `the starter promises ${problem.sql.expectedRowCount} rows but the reference query returns ${rows.length}`,
    );
  }
  // An ordered problem grades on row order, so the reference query must
  // actually pin one. SQLite is free to return any order without ORDER BY.
  if (problem.sql.ordered && !/\border\s+by\b/i.test(query)) {
    issues.push("problem is order-sensitive but the reference query has no ORDER BY");
  }
  db.close();
  return [
    issues.length
      ? { passed: false, error: issues.join("; ") }
      : { passed: true, note: `${rows.length} rows, ${cols.length} cols` },
  ];
}

/* ------------------------------------------------------------------ */
/* driver                                                              */
/* ------------------------------------------------------------------ */
const ADAPTERS = { python: runPython, javascript: runJavaScript };

async function verifyLanguage(problem, lang) {
  const binding = problem.languages[lang];
  if (problem.kind === "sql") return runSql(problem);
  const adapter = ADAPTERS[lang];
  if (!adapter) {
    // A binding nobody can check is worse than no binding: it looks verified.
    throw new Error(`no verifier adapter for language "${lang}"`);
  }
  return adapter(problem, binding.solution);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith("--"));
  const langFilter = args.find((a) => a.startsWith("--lang="))?.slice(7);

  const problems = loadAllProblems().filter(
    (p) => only.length === 0 || only.some((o) => p.id.includes(o)),
  );
  if (!problems.length) {
    console.error("no problems matched");
    process.exit(1);
  }

  // The checked-in JSON Schema is generated from the zod schema. If it is
  // stale, whatever validates against it is validating against a fiction.
  if (!existsSync(SCHEMA_FILE) || readFileSync(SCHEMA_FILE, "utf8") !== serialize(buildJsonSchema())) {
    console.error("FAIL schema.json is stale - run `npm run schema`");
    process.exit(1);
  }

  let checks = 0;
  const failures = [];

  for (const problem of problems) {
    const langs = languagesOf(problem).filter((l) => !langFilter || l === langFilter);
    if (!langs.length) continue;
    const parts = [];
    for (const lang of langs) {
      let results;
      try {
        results = await verifyLanguage(problem, lang);
      } catch (e) {
        results = [{ passed: false, error: e.message }];
      }
      checks += 1;
      const bad = results.map((r, i) => [i, r]).filter(([, r]) => !r.passed);
      const total = results.length;
      if (bad.length) {
        parts.push(`${lang} ${total - bad.length}/${total} FAIL`);
        failures.push({ problem, lang, bad, total });
      } else {
        parts.push(`${lang} ${results[0]?.note ?? `${total}/${total}`}`);
      }
    }
    const status = failures.some((f) => f.problem.id === problem.id) ? "FAIL" : "ok  ";
    console.log(`${status} ${problem.id.padEnd(28)} ${parts.join("  |  ")}`);
  }

  if (failures.length) {
    console.log("");
    for (const { problem, lang, bad, total } of failures) {
      console.log(`FAIL ${problem.id} [${lang}] - ${bad.length} of ${total} failed`);
      for (const [i, r] of bad.slice(0, 5)) {
        const test = problem.kind === "code" ? problem.tests[i] : null;
        const input = test ? show(test.args ?? test.stdin) : "";
        console.log(
          `   test ${i + 1} | in=${input}` +
            (r.expected === undefined ? "" : ` | expected=${show(r.expected)} | got=${show(r.got)}`) +
            (r.error ? ` | ${r.error}` : ""),
        );
      }
    }
  }

  console.log(
    `\n${problems.length} problems, ${checks} language checks, ${failures.length} failing`,
  );
  process.exit(failures.length ? 1 : 0);
}

await main();
