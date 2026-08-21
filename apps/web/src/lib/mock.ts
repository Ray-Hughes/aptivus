/**
 * Composing a mock round, and the two guards that make the contract real.
 *
 * Everything here runs on the server. That is not incidental: the pre-round
 * screen is allowed to say "one SQL query, medium, ~15 min" and is *not*
 * allowed to say which one, because a named pattern is a hint and a title is
 * most of a pattern. So the composer picks the problems here and hands the
 * browser only the shape.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attempts, companies, mockRoundProblems, mockRounds, problems } from "@/db/schema";

export const SHAPES = ["split", "sql", "algo"] as const;
export type Shape = (typeof SHAPES)[number];

export const LENGTHS = [25, 45, 60] as const;
export type Length = (typeof LENGTHS)[number];

export type Skew = "easy" | "medium" | "hard";

/* ------------------------------------------------------------------ */
/* reading the company research                                        */
/* ------------------------------------------------------------------ */

type Profile = {
  sql?: { present?: boolean; weight?: string; notes?: string };
  difficulty?: { skew?: string; notes?: string };
  loop?: { rounds?: { name?: string; duration_minutes?: number | null; covers?: string; format?: string }[] };
  quirks?: unknown;
  industry?: string;
};

/**
 * The research files write difficulty as free prose ("medium-to-hard",
 * "medium, explicitly not LeetCode-hard"). Read it rather than demanding the
 * pack be re-shaped: the negation test has to come first or Stripe reads hard.
 */
export function skewOf(text: string | undefined): Skew {
  const s = (text ?? "").toLowerCase();
  if (!s) return "medium";
  if (/\bnot\b[^.]{0,40}hard/.test(s)) return "medium";
  if (/hard/.test(s)) return "hard";
  if (/^easy|\beasy\b/.test(s)) return "easy";
  return "medium";
}

/** heavy · moderate · light · none · unknown, normalised to a recommendation. */
export function shapeFor(weight: string | undefined): Shape {
  const w = (weight ?? "").toLowerCase();
  if (w.includes("heavy") || w === "moderate") return "split";
  if (w.includes("moderate")) return "split";
  if (w.includes("light")) return "algo";
  if (w === "none") return "algo";
  return "split";
}

/** The reported length of the actual coding round, when there is one. */
export function lengthFor(profile: Profile | null): Length {
  const rounds = profile?.loop?.rounds ?? [];
  const coding = rounds.find(
    (r) =>
      /cod|algorithm|technical (phone )?screen/i.test(r.name ?? "") &&
      typeof r.duration_minutes === "number" &&
      r.duration_minutes >= 30 &&
      r.duration_minutes <= 90,
  );
  const m = coding?.duration_minutes ?? 45;
  return m <= 35 ? 45 : m >= 60 ? 60 : 45;
}

export type Source = {
  id: string;
  kind: "company" | "pack";
  slug: string;
  name: string;
  sub: string;
  mono: string;
  sqlWeight: string;
  shape: Shape;
  length: Length;
  skew: Skew;
  /** Two or three lines of real research, shown next to the picker. */
  facts: { k: string; v: string }[];
};

const monogram = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "??";

function firstSentence(s: string | undefined, max = 190): string {
  if (!s) return "";
  const t = s.trim();
  const cut = t.slice(0, max);
  const stop = cut.lastIndexOf(". ");
  return (stop > 60 ? cut.slice(0, stop + 1) : cut) + (t.length > max && stop <= 60 ? "…" : "");
}

/** Every target a round can be drawn against: published companies, then packs. */
export async function listSources(): Promise<Source[]> {
  const rows = await db
    .select({ slug: companies.slug, name: companies.name, industry: companies.industry, profile: companies.profile })
    .from(companies)
    .where(eq(companies.isPublished, true));

  const packRows = await db
    .selectDistinct({ pack: problems.pack })
    .from(problems)
    .where(eq(problems.isPublished, true));

  const counts = await db
    .select({ pack: problems.pack, kind: problems.kind })
    .from(problems)
    .where(eq(problems.isPublished, true));

  const out: Source[] = [];

  for (const r of rows) {
    const p = (r.profile ?? null) as Profile | null;
    const weight = p?.sql?.weight ?? "unknown";
    const skew = skewOf(p?.difficulty?.skew);
    out.push({
      id: `company:${r.slug}`,
      kind: "company",
      slug: r.slug,
      name: r.name,
      sub: firstSentence(r.industry ?? "", 60),
      mono: monogram(r.name),
      sqlWeight: weight,
      shape: shapeFor(weight),
      length: lengthFor(p),
      skew,
      facts: [
        {
          k: "SQL",
          v:
            weight === "unknown"
              ? "Unconfirmed. No reported round names SQL either way, so the round defaults to the pack's own spread."
              : `${weight[0].toUpperCase()}${weight.slice(1)}. ${firstSentence(p?.sql?.notes, 170)}`,
        },
        { k: "Difficulty", v: firstSentence(p?.difficulty?.skew, 170) || "Not reported." },
        {
          k: "Source",
          v: "Research pack. It records the shape of a loop, never a question.",
        },
      ],
    });
  }

  for (const { pack } of packRows) {
    const mine = counts.filter((c) => c.pack === pack);
    const sql = mine.filter((c) => c.kind === "sql").length;
    const code = mine.length - sql;
    out.push({
      id: `pack:${pack}`,
      kind: "pack",
      slug: pack,
      name: `${pack[0].toUpperCase()}${pack.slice(1)} pack`,
      sub: `${code} Python · ${sql} SQL`,
      mono: String(mine.length),
      sqlWeight: sql > code ? "heavy" : sql === 0 ? "none" : "moderate",
      shape: sql === 0 ? "algo" : "split",
      length: 45,
      skew: "medium",
      facts: [
        { k: "Contents", v: `${mine.length} problems — ${code} Python and ${sql} SQL.` },
        {
          k: "Note",
          v: "A round drawn from a pack ignores company calibration. You get the pack's own difficulty spread.",
        },
      ],
    });
  }

  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "company" ? -1 : 1));
  return out;
}

export async function findSource(id: string): Promise<Source | null> {
  const all = await listSources();
  return all.find((s) => s.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* the draw                                                            */
/* ------------------------------------------------------------------ */

/**
 * A seeded PRNG, so *Reroll* is reproducible. The preview the learner reads
 * and the round that actually starts have to be the same two problems, and
 * the only thing carried between those two requests is the roll number.
 */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

const DIFF_RANK: Record<Skew, Record<string, number>> = {
  easy: { easy: 0, medium: 1, hard: 2 },
  medium: { medium: 0, easy: 1, hard: 2 },
  hard: { hard: 0, medium: 1, easy: 2 },
};

export type Slot = {
  problemId: string;
  slug: string;
  kind: "sql" | "code";
  difficulty: string;
  minutes: number;
};

/** What the browser is allowed to know before the clock starts. */
export type PublicSlot = Omit<Slot, "problemId" | "slug">;

export type Composition = {
  slots: Slot[];
  seconds: number;
  slackSeconds: number;
  shape: Shape;
};

/**
 * Draw two problems. Kind comes from the shape, difficulty is nudged towards
 * the company's reported skew, and anything the learner met in their last few
 * rounds sinks to the back so a fourth round is not a rerun of the first.
 */
export async function compose(opts: {
  userId: string;
  source: Source;
  shape: Shape;
  length: Length;
  roll: number;
}): Promise<Composition> {
  const { userId, source, shape, length, roll } = opts;

  const where = [eq(problems.isPublished, true)];
  if (source.kind === "pack") where.push(eq(problems.pack, source.slug));

  const rows = await db
    .select({
      id: problems.id, slug: problems.slug, kind: problems.kind,
      difficulty: problems.difficulty, minutes: problems.minutes,
    })
    .from(problems)
    .where(and(...where));

  // Recently seen, so the pool feels fresh for at least a few rounds.
  const recentRounds = await db
    .select({ id: mockRounds.id })
    .from(mockRounds)
    .where(eq(mockRounds.userId, userId))
    .orderBy(desc(mockRounds.startedAt))
    .limit(3);
  const recent = recentRounds.length
    ? new Set(
        (
          await db
            .select({ problemId: mockRoundProblems.problemId })
            .from(mockRoundProblems)
            .where(inArray(mockRoundProblems.roundId, recentRounds.map((r) => r.id)))
        ).map((r) => r.problemId),
      )
    : new Set<string>();

  const skew: Skew = length === 25 ? "easy" : length === 60 ? "hard" : source.skew;
  const rank = DIFF_RANK[skew];

  const pick = (kind: "sql" | "code", n: number, taken: Set<string>): Slot[] => {
    const rand = rng(`${source.id}:${shape}:${length}:${kind}:${roll}`);
    const scored = rows
      .filter((r) => r.kind === kind && !taken.has(r.id))
      .map((r) => ({
        r,
        // Difficulty fit dominates; freshness next; the seed breaks the tie,
        // which is what makes Reroll draw a genuinely different pair.
        key: (rank[r.difficulty] ?? 1) * 4 + (recent.has(r.id) ? 2 : 0) + rand(),
      }))
      .sort((a, b) => a.key - b.key);
    return scored.slice(0, n).map(({ r }) => ({
      problemId: r.id, slug: r.slug, kind: r.kind === "sql" ? "sql" : "code",
      difficulty: r.difficulty, minutes: r.minutes,
    }));
  };

  const taken = new Set<string>();
  let slots: Slot[] = [];
  if (shape === "sql") slots = pick("sql", 2, taken);
  else if (shape === "algo") slots = pick("code", 2, taken);
  else {
    const a = pick("sql", 1, taken);
    a.forEach((s) => taken.add(s.problemId));
    slots = [...a, ...pick("code", 1, taken)];
  }

  // A pack with no SQL cannot honour "SQL only"; fall back rather than 404.
  if (slots.length < 2) {
    const rest = pick(slots[0]?.kind === "sql" ? "code" : "sql", 2 - slots.length, new Set(slots.map((s) => s.problemId)));
    slots = [...slots, ...rest];
  }

  const seconds = length * 60;
  const spent = slots.reduce((n, s) => n + s.minutes * 60, 0);
  return { slots, seconds, slackSeconds: seconds - spent, shape };
}

export const publicSlot = (s: Slot): PublicSlot => ({
  kind: s.kind, difficulty: s.difficulty, minutes: s.minutes,
});

/* ------------------------------------------------------------------ */
/* the contract, enforced                                              */
/* ------------------------------------------------------------------ */

/**
 * True when this problem is sitting inside a round the user has open.
 *
 * The pre-round screen promises no hints and no solutions. Hiding the buttons
 * is a UI decision; this is the promise. `/hint` and `/solution` both call it
 * before they spend anything, so the contract survives a curl.
 */
export async function lockedByLiveRound(userId: string, problemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mockRounds.id })
    .from(mockRounds)
    .innerJoin(mockRoundProblems, eq(mockRoundProblems.roundId, mockRounds.id))
    .where(
      and(
        eq(mockRounds.userId, userId),
        eq(mockRounds.status, "in_progress"),
        eq(mockRoundProblems.problemId, problemId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * "Your history 3 of 4" on the scorecard.
 *
 * Every comparison on that page is to the learner's own record and never to
 * other users, so this is the only history that exists: how many distinct
 * problems in each pattern they have met, and how many of those they closed
 * without ever unlocking a hint or a solution.
 */
export async function patternHistory(
  userId: string,
  patterns: string[],
): Promise<Record<string, { clean: number; seen: number }>> {
  const out: Record<string, { clean: number; seen: number }> = {};
  const wanted = patterns.filter(Boolean);
  if (!wanted.length) return out;
  for (const p of wanted) out[p] = { clean: 0, seen: 0 };

  const rows = await db
    .select({
      pattern: problems.pattern,
      problemId: attempts.problemId,
      status: attempts.status,
      hint: attempts.hintLevelUsed,
      revealed: attempts.solutionRevealed,
    })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), inArray(problems.pattern, wanted)));

  const seen = new Map<string, Set<string>>();
  const clean = new Map<string, Set<string>>();
  const dirty = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = r.pattern ?? "";
    if (!out[key]) continue;
    if (!seen.has(key)) { seen.set(key, new Set()); clean.set(key, new Set()); dirty.set(key, new Set()); }
    seen.get(key)!.add(r.problemId);
    if (r.status === "solved" && r.hint === 0 && !r.revealed) clean.get(key)!.add(r.problemId);
    else if (r.hint > 0 || r.revealed) dirty.get(key)!.add(r.problemId);
  }
  for (const key of Object.keys(out)) {
    const c = clean.get(key) ?? new Set<string>();
    const d = dirty.get(key) ?? new Set<string>();
    for (const id of d) c.delete(id);
    out[key] = { clean: c.size, seen: seen.get(key)?.size ?? 0 };
  }
  return out;
}

/**
 * True once a round containing this problem is over.
 *
 * Both write-ups unlock free on the scorecard regardless of outcome - the one
 * thing the round gives away, as a deliberate contrast to the metering.
 */
export async function wasInFinishedRound(userId: string, problemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mockRounds.id })
    .from(mockRounds)
    .innerJoin(mockRoundProblems, eq(mockRoundProblems.roundId, mockRounds.id))
    .where(
      and(
        eq(mockRounds.userId, userId),
        eq(mockRounds.status, "ended"),
        eq(mockRoundProblems.problemId, problemId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The one round a user may have open at a time. */
export async function liveRound(userId: string) {
  const [row] = await db
    .select()
    .from(mockRounds)
    .where(and(eq(mockRounds.userId, userId), eq(mockRounds.status, "in_progress")))
    .orderBy(desc(mockRounds.startedAt))
    .limit(1);
  return row ?? null;
}
