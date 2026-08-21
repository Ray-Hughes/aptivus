#!/usr/bin/env node
/**
 * Validate every course in this directory.
 *
 *   node validate.mjs            # validate, print a summary
 *   node validate.mjs --json     # machine-readable report on stdout
 *   node validate.mjs --quiet    # errors and the summary only
 *
 * Two passes:
 *
 *  1. Schema. `course-schema.json` is checked with a small built-in JSON Schema
 *     subset (type, enum, const, required, properties, additionalProperties, items,
 *     min/maxItems, min/maxLength, minimum/maximum, pattern, $ref, allOf, if/then).
 *     No dependencies on purpose: this runs in CI and in a bare checkout.
 *
 *  2. Semantics. The rules a schema cannot express: problem slugs must exist in
 *     the library - either format, `packages/problems/packs/` or the v1 `packs/` -
 *     planned problems must be optional so a course is completable today,
 *     estimated hours must match the modules, checkpoint answers must be in range.
 *
 * Exit code is 1 if there are errors, 0 if there are only warnings.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const PACKS = join(REPO, "packs");
const V2_PACKS = join(REPO, "packages", "problems", "packs");
const SCHEMA_PATH = join(HERE, "course-schema.json");

const argv = new Set(process.argv.slice(2));
const AS_JSON = argv.has("--json");
const QUIET = argv.has("--quiet") || AS_JSON;

/* ------------------------------------------------------------------ */
/* A very small JSON Schema subset                                     */
/* ------------------------------------------------------------------ */

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v; // string, number, boolean, object
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  if (t === "object") return actual === "object";
  return actual === t;
}

function deref(schema, root) {
  let s = schema;
  let guard = 0;
  while (s && s.$ref && guard++ < 16) {
    const path = s.$ref.replace(/^#\//, "").split("/");
    let node = root;
    for (const part of path) node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (!node) throw new Error(`unresolvable $ref ${s.$ref}`);
    const { $ref, ...rest } = s;
    s = { ...node, ...rest };
  }
  return s;
}

/** Returns an array of error strings. `path` is a JSON-pointer-ish breadcrumb. */
function check(value, schema, root, path, errs = []) {
  const s = deref(schema, root);
  if (!s || typeof s !== "object") return errs;

  const fail = (msg) => errs.push(`${path || "/"}: ${msg}`);

  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(value, t))) {
      fail(`expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return errs; // further checks would be noise
    }
  }
  if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    fail(`must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}, got ${JSON.stringify(value)}`);
  }
  if ("const" in s && JSON.stringify(value) !== JSON.stringify(s.const)) {
    fail(`must equal ${JSON.stringify(s.const)}`);
  }

  if (typeOf(value) === "string") {
    if (s.minLength != null && value.length < s.minLength) {
      fail(`string is ${value.length} chars, minimum ${s.minLength}` +
           (s.minLength >= 400 ? " (this field must hold real content, not a placeholder)" : ""));
    }
    if (s.maxLength != null && value.length > s.maxLength) {
      fail(`string is ${value.length} chars, maximum ${s.maxLength}`);
    }
    if (s.pattern && !new RegExp(s.pattern).test(value)) {
      fail(`${JSON.stringify(value)} does not match ${s.pattern}`);
    }
  }

  if (typeOf(value) === "number" || typeOf(value) === "integer") {
    if (s.minimum != null && value < s.minimum) fail(`${value} is below minimum ${s.minimum}`);
    if (s.maximum != null && value > s.maximum) fail(`${value} is above maximum ${s.maximum}`);
  }

  if (typeOf(value) === "array") {
    if (s.minItems != null && value.length < s.minItems) fail(`needs at least ${s.minItems} items, has ${value.length}`);
    if (s.maxItems != null && value.length > s.maxItems) fail(`allows at most ${s.maxItems} items, has ${value.length}`);
    if (s.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) fail("items must be unique");
    }
    if (s.items) value.forEach((v, i) => check(v, s.items, root, `${path}/${i}`, errs));
  }

  if (typeOf(value) === "object") {
    for (const key of s.required || []) {
      if (!(key in value)) fail(`missing required property "${key}"`);
    }
    const props = s.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(v, props[k], root, `${path}/${k}`, errs);
      else if (s.additionalProperties === false) fail(`unknown property "${k}"`);
    }
  }

  for (const sub of s.allOf || []) check(value, sub, root, path, errs);
  if (s.if) {
    const branch = check(value, s.if, root, path, []).length === 0 ? s.then : s.else;
    if (branch) check(value, branch, root, path, errs);
  }
  if (s.oneOf || s.anyOf) {
    const branches = s.oneOf || s.anyOf;
    const passing = branches.filter((b) => check(value, b, root, path, []).length === 0);
    if (passing.length === 0) fail("matches none of the allowed shapes");
    if (s.oneOf && passing.length > 1) fail("matches more than one of the allowed shapes");
  }

  return errs;
}

/* ------------------------------------------------------------------ */
/* Packs                                                               */
/* ------------------------------------------------------------------ */

/** Pack directories, in the order they are searched. */
const packRoots = () => [
  // Format v2: one JSON document per problem, id == filename stem.
  { root: V2_PACKS, read: readV2Pack },
  // Format v1: a Python module per problem under packs/<pack>/{python,sql}/.
  // Still the shape `app/server.py: load_problems()` reads, so it stays until
  // that server is retired. Anything already migrated is found above first.
  { root: PACKS, read: readV1Pack },
];

/** v2: packages/problems/packs/<pack>/<id>.json, ignoring the pack manifest. */
function readV2Pack(packDir, pack, found) {
  let files = [];
  try {
    files = readdirSync(packDir);
  } catch {
    return;
  }
  for (const fn of files.sort()) {
    if (!fn.endsWith(".json") || fn === "pack.json" || fn.startsWith("_")) continue;
    const id = fn.slice(0, -5);
    let kind = "code";
    try {
      kind = JSON.parse(readFileSync(join(packDir, fn), "utf8")).kind ?? "code";
    } catch {
      // A problem this validator cannot parse is still a problem that exists;
      // `packages/problems/verify.mjs` is what holds the format to account.
    }
    if (!found.has(id)) found.set(id, `${pack}/${kind}`);
  }
}

/** v1: packs/<pack>/{python,sql}/<id>.py, ignoring files that start with "_". */
function readV1Pack(packDir, pack, found) {
  for (const kind of ["python", "sql"]) {
    const dir = join(packDir, kind);
    let files = [];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const fn of files.sort()) {
      if (!fn.endsWith(".py") || fn.startsWith("_")) continue;
      const id = fn.slice(0, -3);
      if (!found.has(id)) found.set(id, `${pack}/${kind}`);
    }
  }
}

/**
 * Every problem id the library can serve today, from both pack formats.
 *
 * A course names a problem by id and does not care which format it is stored
 * in. Reading only v1 here would mean a problem authored in v2 - which is every
 * new one - still looked "not yet written" to the course backlog, and the
 * planned list would never empty.
 */
function loadProblemIds() {
  const found = new Map(); // id -> "pack/kind"
  for (const { root, read } of packRoots()) {
    let packDirs = [];
    try {
      packDirs = readdirSync(root);
    } catch {
      continue;
    }
    for (const pack of packDirs.sort()) {
      const packDir = join(root, pack);
      if (pack.startsWith(".") || !statSync(packDir).isDirectory()) continue;
      read(packDir, pack, found);
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Semantic rules                                                      */
/* ------------------------------------------------------------------ */

function semanticCheck(course, problemIds, allCourseSlugs, errs, warns) {
  const at = (p) => `${course.slug || "?"}${p}`;

  const moduleIds = new Set();
  let totalMinutes = 0;
  const referenced = new Set();
  const missing = [];
  const plannedRefs = [];

  for (const [mi, m] of (course.modules || []).entries()) {
    const mpath = `/modules/${mi}(${m.id || "?"})`;
    if (moduleIds.has(m.id)) errs.push(`${at(mpath)}: duplicate module id "${m.id}" - module ids are progress keys and must be unique`);
    moduleIds.add(m.id);
    totalMinutes += m.estimatedMinutes || 0;

    const seenHere = new Set();
    const required = [];
    for (const [pi, ref] of (m.problems || []).entries()) {
      const ppath = `${mpath}/problems/${pi}(${ref.slug})`;
      if (seenHere.has(ref.slug)) warns.push(`${at(ppath)}: "${ref.slug}" appears twice in the same module`);
      seenHere.add(ref.slug);
      referenced.add(ref.slug);

      const exists = problemIds.has(ref.slug);
      if (ref.planned) {
        plannedRefs.push(ref.slug);
        if (exists) warns.push(`${at(ppath)}: marked planned but "${ref.slug}" now exists in ${problemIds.get(ref.slug)} - drop the planned flag and the optional flag`);
        if (ref.optional !== true) errs.push(`${at(ppath)}: planned problems must be optional, or the module cannot be completed today`);
      } else if (!exists) {
        missing.push(ref.slug);
        errs.push(`${at(ppath)}: references "${ref.slug}", which does not exist in packs/. Fix the slug, or mark it planned + optional with a plannedSpec.`);
      }
      if (!ref.optional && !ref.planned) required.push(ref.slug);
    }

    const c = m.completion || {};
    if (c.rule === "all-required-problems" && required.length === 0) {
      errs.push(`${at(mpath)}: completion rule "all-required-problems" but the module has no required problems - use "checkpoint-only" or "self-attested"`);
    }
    if (c.rule === "min-problems") {
      const solvable = (m.problems || []).filter((p) => !p.planned).length;
      if (c.minProblemsSolved > solvable) {
        errs.push(`${at(mpath)}: needs ${c.minProblemsSolved} solved but only ${solvable} of its problems exist`);
      }
    }
    if (c.rule === "checkpoint-only" && c.requireCheckpoint === false) {
      errs.push(`${at(mpath)}: completion rule "checkpoint-only" with requireCheckpoint false has no completion condition at all`);
    }

    for (const [qi, q] of (m.checkpoint?.questions || []).entries()) {
      if (q.kind === "choice" && !(q.answer >= 0 && q.answer < (q.options || []).length)) {
        errs.push(`${at(mpath)}/checkpoint/questions/${qi}(${q.id}): answer index ${q.answer} is outside options 0..${(q.options || []).length - 1}`);
      }
    }
    const qIds = (m.checkpoint?.questions || []).map((q) => q.id);
    if (new Set(qIds).size !== qIds.length) errs.push(`${at(mpath)}/checkpoint: duplicate question ids`);
  }

  for (const pre of course.prerequisiteCourses || []) {
    if (!allCourseSlugs.has(pre)) errs.push(`${at("/prerequisiteCourses")}: "${pre}" is not a course in this directory`);
    if (pre === course.slug) errs.push(`${at("/prerequisiteCourses")}: a course cannot require itself`);
  }

  const claimed = (course.estimatedHours || 0) * 60;
  if (claimed > 0 && Math.abs(claimed - totalMinutes) / claimed > 0.15) {
    warns.push(
      `${course.slug}: estimatedHours claims ${claimed} minutes but the modules add up to ${totalMinutes} ` +
      `(${(totalMinutes / 60).toFixed(1)}h). Courses must be honest about time.`
    );
  }

  return { referenced, missing, planned: plannedRefs, totalMinutes, moduleCount: (course.modules || []).length };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const problemIds = loadProblemIds();

const files = readdirSync(HERE).filter((f) => f.endsWith(".course.json")).sort();
const courses = [];
const errors = [];
const warnings = [];

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(HERE, file), "utf8"));
  } catch (e) {
    errors.push(`${file}: not valid JSON - ${e.message}`);
    continue;
  }
  courses.push({ file, doc });
}

const slugs = new Map();
for (const { file, doc } of courses) {
  if (slugs.has(doc.slug)) errors.push(`${file}: slug "${doc.slug}" is already used by ${slugs.get(doc.slug)}`);
  else slugs.set(doc.slug, file);
  const expected = `${doc.slug}.course.json`;
  if (file !== expected) warnings.push(`${file}: filename should be "${expected}" to match its slug`);
}
const allSlugs = new Set(slugs.keys());

const report = [];
for (const { file, doc } of courses) {
  const schemaErrs = check(doc, schema, schema, "").map((e) => `${file}${e}`);
  errors.push(...schemaErrs);

  const errs = [];
  const warns = [];
  const stats = semanticCheck(doc, problemIds, allSlugs, errs, warns);
  errors.push(...errs.map((e) => `${file}: ${e}`));
  warnings.push(...warns.map((w) => `${file}: ${w}`));

  report.push({
    file,
    slug: doc.slug,
    title: doc.title,
    modules: stats.moduleCount,
    estimatedHours: doc.estimatedHours,
    moduleMinutes: stats.totalMinutes,
    problemRefs: stats.referenced.size,
    existing: [...stats.referenced].filter((s) => problemIds.has(s)).length,
    missing: [...new Set(stats.missing)],
    planned: [...new Set(stats.planned)],
    schemaErrors: schemaErrs.length,
  });
}

const referencedEverywhere = new Set();
for (const { doc } of courses) {
  for (const m of doc.modules || []) for (const p of m.problems || []) referencedEverywhere.add(p.slug);
}
const existingReferenced = [...referencedEverywhere].filter((s) => problemIds.has(s));
const unreferenced = [...problemIds.keys()].filter((s) => !referencedEverywhere.has(s));
const plannedEverywhere = [...new Set(report.flatMap((r) => r.planned))];
const missingEverywhere = [...new Set(report.flatMap((r) => r.missing))];

if (AS_JSON) {
  console.log(JSON.stringify({
    courses: report, errors, warnings,
    problemsInPacks: problemIds.size,
    referenced: referencedEverywhere.size,
    existingReferenced: existingReferenced.length,
    planned: plannedEverywhere,
    missing: missingEverywhere,
    unreferenced,
  }, null, 2));
} else {
  if (!QUIET) {
    console.log(`packs/: ${problemIds.size} problems found\n`);
    for (const r of report) {
      const flag = r.schemaErrors ? "FAIL" : "ok  ";
      console.log(
        `${flag} ${r.slug.padEnd(28)} ${String(r.modules).padStart(2)} modules  ` +
        `${String(r.estimatedHours).padStart(4)}h  ` +
        `${String(r.problemRefs).padStart(2)} problem refs ` +
        `(${r.existing} existing, ${r.planned.length} planned, ${r.missing.length} missing)`
      );
    }
    console.log();
  }
  for (const w of warnings) console.log(`warning: ${w}`);
  if (warnings.length && !errors.length) console.log();
  for (const e of errors) console.log(`error:   ${e}`);
  if (errors.length) console.log();

  console.log(
    `${report.length} courses, ${report.reduce((a, r) => a + r.modules, 0)} modules, ` +
    `${referencedEverywhere.size} distinct problems referenced: ` +
    `${existingReferenced.length} exist, ${plannedEverywhere.length} planned, ${missingEverywhere.length} missing.`
  );
  if (unreferenced.length) {
    console.log(`${unreferenced.length} problems in packs/ are not used by any course: ${unreferenced.join(", ")}`);
  }
  if (plannedEverywhere.length) {
    console.log(`planned (not yet authored): ${plannedEverywhere.join(", ")}`);
  }
  console.log(errors.length ? `\nFAILED with ${errors.length} error(s).` : `\nOK${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
}

process.exit(errors.length ? 1 : 0);
