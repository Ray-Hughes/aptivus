/**
 * The languages a learner can claim, and how well they claim to know them.
 *
 * Deliberately free of server-only imports - and of zod - so the settings
 * Client Component can share this list with the route that validates against
 * it, without dragging a validator into the browser bundle. The route builds
 * its schema from these constants; the client never gets to decide what is
 * allowed.
 */
export const EXPERTISE_LANGUAGES = [
  "python", "javascript", "typescript", "ruby", "go", "rust", "java",
  "c", "csharp", "php", "swift", "kotlin", "scala", "elixir",
] as const;

export const EXPERTISE_LEVELS = ["working", "strong", "expert"] as const;

export type ExpertiseLanguage = (typeof EXPERTISE_LANGUAGES)[number];
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];
export type ExpertiseEntry = { language: ExpertiseLanguage; level: ExpertiseLevel };

export const LANGUAGE_LABELS: Record<ExpertiseLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  ruby: "Ruby",
  go: "Go",
  rust: "Rust",
  java: "Java",
  c: "C",
  csharp: "C#",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  elixir: "Elixir",
};

/**
 * The wording carries the whole meaning of the setting: a track is written
 * against what the learner already knows, so "strong" and "expert" have to be
 * distinguishable without a tooltip.
 */
export const LEVEL_LABELS: Record<ExpertiseLevel, string> = {
  working: "Working — can ship in it",
  strong: "Strong — reach for it by default",
  expert: "Expert — know its sharp edges",
};

/**
 * Read side of the same contract. The column is free-form JSON with no
 * database constraint behind it, so a row written before this list existed can
 * name a language the editor has no option for - which would render as a blank
 * select the user cannot fix. Drop what cannot be represented instead.
 */
export function normalizeExpertise(raw: unknown): ExpertiseEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExpertiseEntry[] = [];
  for (const row of raw) {
    const language = (row as { language?: unknown })?.language;
    const level = (row as { level?: unknown })?.level;
    if (typeof language !== "string" || typeof level !== "string") continue;
    if (!(EXPERTISE_LANGUAGES as readonly string[]).includes(language)) continue;
    if (!(EXPERTISE_LEVELS as readonly string[]).includes(level)) continue;
    if (seen.has(language)) continue;
    seen.add(language);
    out.push({ language: language as ExpertiseLanguage, level: level as ExpertiseLevel });
  }
  return out;
}
