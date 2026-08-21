import "server-only";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Authored knowledge about moving between two languages.
 *
 * Deliberately not generated. "In Ruby this returns nil, in Go it returns a
 * zero value" is either true or false, and a model states false ones fluently.
 * The learner cannot check it - not knowing the target language is why they are
 * here - so a wrong comparison is worse than none. These facts are reviewable
 * and identical for everyone; the model's job is deciding which of them THIS
 * job needs first, and writing the exercises.
 */
export type Concept = {
  id: string;
  title: string;
  theirs: string;
  yours: string;
  trap: string;
  severity: "high" | "medium" | "low";
  tags: string[];
};

export type Verification = {
  /**
   * "executed" means the snippets behind these claims were actually run in
   * both languages. "reviewed" means they were not - usually because the
   * toolchain was not available - so they rest on care alone.
   *
   * This is surfaced to the learner rather than kept internal. Telling someone
   * a comparison is checked when it was not is exactly the failure this whole
   * package exists to prevent, only with our name on it.
   */
  level: "executed" | "reviewed";
  note: string;
};

export type TransitionMap = {
  from: string;
  to: string;
  summary: string;
  verification: Verification;
  concepts: Concept[];
};

const DIR = path.join(process.cwd(), "..", "..", "packages", "transitions");

export function availablePairs(): { from: string; to: string; level: Verification["level"] }[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      // Split on the separator, not on every hyphen: a slug may contain one.
      const [from, to] = f.replace(/\.json$/, "").split("-to-");
      if (!from || !to) return [];
      const map = read(path.join(DIR, f));
      return map ? [{ from, to, level: map.verification.level }] : [];
    });
}

function read(file: string): TransitionMap | null {
  try {
    const map = JSON.parse(readFileSync(file, "utf8")) as TransitionMap;
    return map.verification?.level && Array.isArray(map.concepts) ? map : null;
  } catch {
    return null;
  }
}

/** The best authored map for someone who knows several languages. */
export function loadTransition(known: string[], target: string): TransitionMap | null {
  if (!existsSync(DIR)) return null;
  for (const from of known) {
    const file = path.join(DIR, `${from.toLowerCase()}-to-${target.toLowerCase()}.json`);
    if (existsSync(file)) return read(file);
  }
  return null;
}

/** Rendered into the prompt so the model orders facts rather than inventing them. */
export function transitionBrief(map: TransitionMap): string {
  const line = (c: Concept) =>
    `- [${c.severity}] ${c.title}\n` +
    `    in ${map.from}: ${c.theirs}\n` +
    `    in ${map.to}: ${c.yours}\n` +
    `    trap: ${c.trap}`;
  return [
    `How ${map.from} maps onto ${map.to}:`,
    map.summary,
    "",
    map.verification.level === "executed"
      ? "Concept correspondences, each checked by running it in both languages."
      : "Concept correspondences, written carefully but NOT executed.",
    "Use these; do not invent others. If you need a comparison that is not here,",
    "say the thing you are sure of and leave the comparison out.",
    "",
    ...map.concepts.map(line),
  ].join("\n");
}
