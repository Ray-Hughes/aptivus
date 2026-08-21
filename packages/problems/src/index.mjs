/**
 * Loading the packs off disk. Used by the verifier, the importer and any CLI.
 * Nothing here touches a database or a network.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PackSchema, parseProblem } from "./schema.mjs";

export * from "./schema.mjs";

/**
 * Where the packs live. `APTIVUS_PACKS` points the loader somewhere else, which
 * is how a generated problem gets run through the verifier before anyone sees
 * it without being written into the curated library first.
 */
export const PACKS_DIR =
  process.env.APTIVUS_PACKS ?? join(dirname(dirname(fileURLToPath(import.meta.url))), "packs");

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** Pack names, sorted. */
export function listPacks(root = PACKS_DIR) {
  if (!isDir(root)) return [];
  return readdirSync(root)
    .filter((n) => !n.startsWith(".") && isDir(join(root, n)))
    .sort();
}

/** One pack's manifest. */
export function loadPack(pack, root = PACKS_DIR) {
  const file = join(root, pack, "pack.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const out = PackSchema.safeParse(raw);
  if (!out.success) throw new Error(`${file} is not a valid pack manifest: ${out.error.message}`);
  return out.data;
}

/**
 * Every problem in a pack, validated. A problem that does not parse is a hard
 * error rather than a skip: a silently missing problem is worse than a loud
 * broken one.
 */
export function loadPackProblems(pack, root = PACKS_DIR) {
  const dir = join(root, pack);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "pack.json")
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const problem = parseProblem(JSON.parse(readFileSync(path, "utf8")), path);
      if (problem.pack !== pack) {
        throw new Error(`${path}: declares pack "${problem.pack}" but lives in packs/${pack}`);
      }
      if (`${problem.id}.json` !== f) {
        throw new Error(`${path}: id "${problem.id}" does not match the filename`);
      }
      return { ...problem, path };
    });
}

/** Every problem in every pack. Ids are unique across packs. */
export function loadAllProblems(root = PACKS_DIR) {
  const seen = new Map();
  const out = [];
  for (const pack of listPacks(root)) {
    for (const p of loadPackProblems(pack, root)) {
      if (seen.has(p.id)) {
        throw new Error(`duplicate problem id "${p.id}" in ${p.path} and ${seen.get(p.id)}`);
      }
      seen.set(p.id, p.path);
      out.push(p);
    }
  }
  return out;
}

/** The languages a problem actually carries a reference solution for. */
export function languagesOf(problem) {
  return Object.keys(problem.languages).filter((l) => problem.languages[l]?.solution?.trim());
}

/** Sample tests only - the ones it is safe to send to a browser. */
export function sampleTests(problem) {
  return problem.kind === "code" ? problem.tests.filter((t) => t.sample) : [];
}
