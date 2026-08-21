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

export type TransitionMap = {
  from: string;
  to: string;
  summary: string;
  concepts: Concept[];
};

const DIR = path.join(process.cwd(), "..", "..", "packages", "transitions");

export function availablePairs(): { from: string; to: string }[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const [from, , to] = f.replace(/\.json$/, "").split("-");
      return { from, to };
    });
}

/** The best authored map for someone who knows several languages. */
export function loadTransition(known: string[], target: string): TransitionMap | null {
  if (!existsSync(DIR)) return null;
  for (const from of known) {
    const file = path.join(DIR, `${from.toLowerCase()}-to-${target.toLowerCase()}.json`);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, "utf8")) as TransitionMap;
      } catch {
        return null;
      }
    }
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
    "Verified concept correspondences (use these; do not invent others):",
    ...map.concepts.map(line),
  ].join("\n");
}
