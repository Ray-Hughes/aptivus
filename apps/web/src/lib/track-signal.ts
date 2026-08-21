import "server-only";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { trackLessons, trackProgress } from "@/db/schema";
import type { Lesson } from "./track-gen";

/**
 * What the learner's own history says about how the next lesson should be
 * written.
 *
 * This is only possible because lessons are written on first open: by the time
 * lesson 5 is generated, lessons 1 to 4 have actually been attempted. A
 * roadmap generated all at once could not do this.
 *
 * The signal is deliberately small. Everything here is something the learner
 * DID - attempts, hints taken, solutions revealed - rather than a judgement
 * about them. "You took all three hints on closures" is a fact the model can
 * act on; "this learner is weak" is a story that produces condescending
 * lessons.
 */

export type LessonOutcome = {
  title: string;
  /** The concepts the lesson claimed to teach, for naming what to revisit. */
  relevance: string;
  attempts: number;
  hintsUsed: number;
  hintsAvailable: number;
  solutionRevealed: boolean;
  completed: boolean;
  /** Started and never finished - the strongest signal of all. */
  abandoned: boolean;
};

export type Pace = "flying" | "steady" | "struggling" | "unknown";

export type Signal = {
  pace: Pace;
  done: number;
  recent: LessonOutcome[];
  /** Lessons whose answer they had to be given. These are the ones to revisit. */
  revealed: string[];
  /** A short line for the UI, so the learner can see what we adapted to. */
  summary: string;
};

/**
 * Thresholds are stated here rather than buried in the prompt so they can be
 * argued with. They are per-lesson averages over the last few lessons.
 */
const FLYING = { maxAttempts: 2, maxHints: 0.4 };
const STRUGGLING = { minAttempts: 4, minHints: 1.6 };
const WINDOW = 4;

export async function learnerSignal(
  userId: string,
  trackId: string,
  beforePosition: number,
): Promise<Signal> {
  const rows = await db
    .select({ lesson: trackLessons, progress: trackProgress })
    .from(trackLessons)
    .leftJoin(
      trackProgress,
      and(eq(trackProgress.lessonId, trackLessons.id), eq(trackProgress.userId, userId)),
    )
    .where(and(eq(trackLessons.trackId, trackId), lt(trackLessons.position, beforePosition)))
    .orderBy(asc(trackLessons.position));

  const touched = rows.filter((r) => r.progress);
  if (!touched.length) {
    return { pace: "unknown", done: 0, recent: [], revealed: [], summary: "" };
  }

  const outcomes: LessonOutcome[] = touched.map(({ lesson, progress }) => {
    const body = lesson.body as Partial<Lesson>;
    return {
      title: lesson.title,
      relevance: lesson.relevance,
      attempts: progress?.attempts ?? 0,
      hintsUsed: progress?.hintsUsed ?? 0,
      hintsAvailable: body?.hints?.length ?? 3,
      solutionRevealed: Boolean(progress?.solutionRevealed),
      completed: progress?.status === "complete",
      abandoned: progress?.status !== "complete" && (progress?.attempts ?? 0) > 0,
    };
  });

  const recent = outcomes.slice(-WINDOW);
  const avg = (pick: (o: LessonOutcome) => number) =>
    recent.reduce((n, o) => n + pick(o), 0) / recent.length;
  const attempts = avg((o) => o.attempts);
  const hints = avg((o) => o.hintsUsed);
  const reveals = recent.filter((o) => o.solutionRevealed).length;
  const abandoned = recent.filter((o) => o.abandoned).length;

  // Revealing the answer or walking away outweighs the averages: someone who
  // gave up on two of the last four is struggling however few attempts it took.
  const pace: Pace =
    reveals >= 2 || abandoned >= 2 || attempts >= STRUGGLING.minAttempts || hints >= STRUGGLING.minHints
      ? "struggling"
      : reveals === 0 && abandoned === 0 && attempts <= FLYING.maxAttempts && hints <= FLYING.maxHints
        ? "flying"
        : "steady";

  const completed = outcomes.filter((o) => o.completed).length;
  const summary =
    pace === "flying"
      ? `${completed} lessons in with barely a hint — this one goes deeper.`
      : pace === "struggling"
        ? "Built from where the last few lessons actually went — smaller step, same destination."
        : `Adapted to your last ${recent.length} lessons.`;

  return {
    pace,
    done: completed,
    recent,
    revealed: outcomes.filter((o) => o.solutionRevealed).map((o) => o.title),
    summary,
  };
}

/**
 * The signal, rendered for the prompt.
 *
 * The instructions are the load-bearing part. Left to itself a model reads
 * "struggling" and writes a smaller, easier, emptier lesson, which is how
 * adaptive teaching quietly turns into teaching nothing. Adapting the step
 * size is the goal; adapting the destination is the failure.
 */
export function signalBrief(signal: Signal): string {
  if (signal.pace === "unknown") return "";

  const rows = signal.recent
    .map((o) => {
      const bits = [
        `${o.attempts} attempt${o.attempts === 1 ? "" : "s"}`,
        o.hintsUsed ? `${o.hintsUsed} of ${o.hintsAvailable} hints` : "no hints",
      ];
      if (o.solutionRevealed) bits.push("had to read the solution");
      if (o.abandoned) bits.push("started and never finished");
      return `- "${o.title}": ${bits.join(", ")}`;
    })
    .join("\n");

  const direction =
    signal.pace === "flying"
      ? `They are finding this easy. Raise the ceiling: assume the basics of the
last few lessons are held, skip the gentle ramp, and make the exercise ask for
something a careless answer gets wrong. Do not simply add volume - a longer
easy exercise is not a harder one.`
      : signal.pace === "struggling"
        ? `The last few have been hard going. Take a SMALLER STEP, not a smaller
lesson: teach one idea instead of two, give more of the surrounding code in the
scaffold, and let the first test be one they can pass quickly to get moving.

Do NOT lower what is actually taught, do not skip the trap, and do not write
down to them. They are an experienced engineer having a hard time with an
unfamiliar language, which is the normal condition of the thing they are doing
and not a deficiency. Never refer to their difficulty.`
        : `Keep the current step size - it is working.`;

  const revisit = signal.revealed.length
    ? `\nThey had to be shown the answer for: ${signal.revealed.map((t) => `"${t}"`).join(", ")}.
If this lesson can naturally use that idea again, use it. A concept met a
second time in a new context is the cheapest way to fix one that did not land.`
    : "";

  return `
HOW THIS LEARNER IS ACTUALLY DOING
Their last ${signal.recent.length} lesson${signal.recent.length === 1 ? "" : "s"}:
${rows}

${direction}${revisit}
`.trim();
}
