import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import type { Lesson } from "./track-gen";

/**
 * A generated lesson is not shown until its own reference solution has been run
 * against its own tests and passed.
 *
 * This is the whole quality mechanism. Models write plausible lessons whose
 * solution does not actually satisfy the tests, or whose expected values are
 * subtly wrong, and a learner cannot tell the difference between "I am wrong"
 * and "the lesson is wrong" - which is corrosive in a product whose job is to
 * tell them which. Verified content is the thing a competitor generating
 * straight into a UI cannot match.
 *
 * Python runs through the same core/engine.py the browser uses, loaded into
 * Pyodide here, so a lesson verified on the server behaves identically in the
 * learner's tab.
 *
 * That identity is load-bearing and it is NOT automatic: the pyodide npm
 * package must stay pinned to the same version public/engine-worker.js loads
 * from the CDN. They were 0.26.4 and 314.0.5 for a while, which meant we were
 * certifying lessons against Python 3.14 and running them on 3.12. Bump both
 * or neither.
 */
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/* ---------------------------------------------------------------- */
/* JavaScript                                                        */
/* ---------------------------------------------------------------- */
function compare(got: unknown, want: unknown): boolean {
  if (typeof want === "number" && typeof got === "number") {
    return Math.abs(got - want) < 1e-6;
  }
  try {
    return JSON.stringify(got ?? null) === JSON.stringify(want ?? null);
  } catch {
    return false;
  }
}

function verifyJs(lesson: Lesson): VerifyResult {
  const context = vm.createContext({ console: { log() {}, error() {}, warn() {} } });
  let fn: unknown;
  try {
    fn = vm.runInContext(
      `"use strict";\n${lesson.solution}\n;typeof ${lesson.func} === "function" ? ${lesson.func} : undefined;`,
      context,
      { timeout: 4000 },
    );
  } catch (e) {
    return { ok: false, reason: `solution did not run: ${(e as Error).message}` };
  }
  if (typeof fn !== "function") {
    return { ok: false, reason: `solution defines no function named ${lesson.func}` };
  }
  for (const [i, t] of lesson.tests.entries()) {
    try {
      const got = (fn as (...a: unknown[]) => unknown)(...structuredClone(t.args));
      if (!compare(got, t.expected)) {
        return {
          ok: false,
          reason: `test ${i + 1} failed: expected ${JSON.stringify(t.expected)}, got ${JSON.stringify(got)}`,
        };
      }
    } catch (e) {
      return { ok: false, reason: `test ${i + 1} threw: ${(e as Error).message}` };
    }
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Python, via the shipped engine inside Pyodide                     */
/* ---------------------------------------------------------------- */
type PyodideApi = {
  FS: { writeFile: (p: string, d: string) => void };
  runPython: (code: string) => string;
  globals: { set: (k: string, v: string) => void };
};

let pyodide: Promise<PyodideApi> | null = null;

async function getPyodide(): Promise<PyodideApi> {
  if (pyodide) return pyodide;
  pyodide = (async () => {
    const mod = (await import("pyodide")) as unknown as {
      loadPyodide: () => Promise<PyodideApi>;
    };
    const py = await mod.loadPyodide();
    const engine = readFileSync(
      path.join(process.cwd(), "public", "engine.py"),
      "utf8",
    );
    py.FS.writeFile("/home/pyodide/engine.py", engine);
    py.runPython("import sys; sys.path.insert(0, '/home/pyodide')\nimport engine, json\n");
    return py;
  })();
  return pyodide;
}

async function verifyPython(lesson: Lesson): Promise<VerifyResult> {
  try {
    const py = await getPyodide();
    // JSON crosses as TEXT and is parsed in Python: JS has one number type and
    // would silently turn 1.0 into 1, changing what a test asserts.
    py.globals.set(
      "_req",
      JSON.stringify({
        op: "run",
        code: lesson.solution,
        cases: lesson.tests,
        mode: "function",
        func: lesson.func,
      }),
    );
    const out = JSON.parse(
      py.runPython("json.dumps(engine.dispatch(json.loads(_req)))"),
    ) as { results?: { passed: boolean; error: string; got: unknown; expected: unknown }[] };

    const results = out.results ?? [];
    if (!results.length) return { ok: false, reason: "no tests ran" };
    const bad = results.findIndex((r) => !r.passed);
    if (bad >= 0) {
      const r = results[bad];
      return {
        ok: false,
        reason: r.error
          ? `test ${bad + 1} errored: ${r.error}`
          : `test ${bad + 1} failed: expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.got)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `python verification failed: ${(e as Error).message}` };
  }
}

/* ---------------------------------------------------------------- */

export async function verifyLesson(
  language: string,
  lesson: Lesson,
): Promise<VerifyResult> {
  if (!lesson.solution?.trim()) return { ok: false, reason: "no solution" };
  if (!lesson.tests?.length) return { ok: false, reason: "no tests" };
  // A scaffold identical to the solution leaves nothing to complete.
  if (lesson.scaffold.trim() === lesson.solution.trim()) {
    return { ok: false, reason: "scaffold is the solution - nothing to complete" };
  }

  switch (language) {
    case "javascript":
      return verifyJs(lesson);
    case "python":
      return verifyPython(lesson);
    case "ruby":
      // No Ruby runtime on the server yet. Rather than pretend, mark it
      // unverified so it is never shown as checked.
      return { ok: false, reason: "ruby verification is not wired up yet" };
    default:
      return { ok: false, reason: `no verifier for ${language}` };
  }
}
