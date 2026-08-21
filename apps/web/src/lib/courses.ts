/**
 * Reading courses, and deciding what a module's state actually is.
 *
 * `packages/courses/src/types.ts` is the authored mirror of the JSON Schema;
 * the zod schemas below are the app's copy of the same shape, and the only way
 * a stored `courses.body` becomes typed data. The importer validates before a
 * row lands, so this parse is a second gate rather than the only one - but it
 * is cheap, it runs once per request thanks to `cache()`, and it means a
 * hand-edited row cannot crash a page with an undefined property.
 *
 * Everything about completion is derived *here*, on the server, from the stored
 * course and the stored progress. Nothing in this file reads a client-supplied
 * "done". The Server Actions in `app/courses/_actions.ts` call `moduleStatus`
 * again before they write `status = 'complete'`, so a forged POST gets the same
 * answer the page would have shown.
 */
import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, courseProgress, courses, problems } from "@/db/schema";

/* ------------------------------------------------------------------ */
/* the format                                                          */
/* ------------------------------------------------------------------ */

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const ProblemSlug = z.string().regex(/^[a-z0-9][a-z0-9_]*$/);

export const PlannedSpecSchema = z.object({
  title: z.string(),
  pattern: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  minutes: z.number().int(),
  brief: z.string().optional(),
});

export const ProblemRefSchema = z.object({
  slug: ProblemSlug,
  note: z.string().optional(),
  optional: z.boolean().optional(),
  planned: z.boolean().optional(),
  plannedSpec: PlannedSpecSchema.optional(),
});

export const QuestionSchema = z.object({
  id: Slug,
  kind: z.enum(["choice", "recall", "explain"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.number().int().optional(),
  modelAnswer: z.string().optional(),
  explanation: z.string().optional(),
});

export const CheckpointSchema = z.object({
  id: Slug,
  title: z.string(),
  intro: z.string().optional(),
  questions: z.array(QuestionSchema).min(1),
});

export const CompletionSchema = z.object({
  rule: z.enum(["all-required-problems", "min-problems", "checkpoint-only", "self-attested"]),
  minProblemsSolved: z.number().int().min(1).optional(),
  requireCheckpoint: z.boolean().optional(),
  checkpointPassScore: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const ModuleSchema = z.object({
  id: Slug,
  title: z.string(),
  summary: z.string(),
  estimatedMinutes: z.number().int(),
  objectives: z.array(z.string()).optional(),
  teaching: z.string(),
  problems: z.array(ProblemRefSchema),
  checkpoint: CheckpointSchema,
  completion: CompletionSchema,
  recap: z.string().optional(),
});

export const CourseSchema = z.object({
  slug: Slug,
  title: z.string(),
  subtitle: z.string(),
  audience: z.string(),
  level: z.enum(["foundational", "intermediate", "advanced"]).optional(),
  estimatedHours: z.number(),
  timeNote: z.string().optional(),
  prerequisites: z.array(z.string()),
  prerequisiteCourses: z.array(Slug).optional(),
  outcomes: z.array(z.string()),
  tags: z.array(z.string()).optional(),
  version: z.number().int().optional(),
  modules: z.array(ModuleSchema).min(1),
});

export type Course = z.infer<typeof CourseSchema>;
export type CourseModule = z.infer<typeof ModuleSchema>;
export type ProblemRef = z.infer<typeof ProblemRefSchema>;
export type Question = z.infer<typeof QuestionSchema>;

export type CourseRow = typeof courses.$inferSelect;
export type ProgressRow = typeof courseProgress.$inferSelect;
export type LoadedCourse = { row: CourseRow; body: Course };

/** The default bar, from the schema. Both matter: 0.8 is not the same as "any". */
const DEFAULT_PASS_SCORE = 0.8;
const DEFAULT_REQUIRE_CHECKPOINT = true;

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

function parse(row: CourseRow): LoadedCourse | null {
  const parsed = CourseSchema.safeParse(row.body);
  if (!parsed.success) {
    // A malformed row is a broken import, not a broken request: drop the course
    // from the listing and say so in the log rather than 500 the catalogue.
    console.error(`[courses] ${row.slug} failed to parse:`, parsed.error.issues[0]);
    return null;
  }
  return { row, body: parsed.data };
}

/** Gentlest first, then shortest: the order someone browsing should meet them in. */
const LEVEL_RANK: Record<string, number> = { foundational: 0, intermediate: 1, advanced: 2 };

export const listCourses = cache(async (): Promise<LoadedCourse[]> => {
  const rows = await db.select().from(courses).where(eq(courses.isPublished, true));
  return rows
    .map(parse)
    .filter((c): c is LoadedCourse => c !== null)
    .sort(
      (a, b) =>
        (LEVEL_RANK[a.body.level ?? "intermediate"] ?? 1) -
          (LEVEL_RANK[b.body.level ?? "intermediate"] ?? 1) ||
        a.body.estimatedHours - b.body.estimatedHours,
    );
});

export const getCourse = cache(async (slug: string): Promise<LoadedCourse | null> => {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.isPublished, true)))
    .limit(1);
  return row ? parse(row) : null;
});

/** Progress rows for one course, keyed by module id. */
export const progressForCourse = cache(
  async (userId: string, courseSlug: string): Promise<Map<string, ProgressRow>> => {
    const rows = await db
      .select()
      .from(courseProgress)
      .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseSlug, courseSlug)));
    return new Map(rows.map((r) => [r.moduleId, r]));
  },
);

/** Every progress row a user has, newest touch first. Used by the catalogue. */
export const allProgress = cache(async (userId: string): Promise<ProgressRow[]> => {
  return db
    .select()
    .from(courseProgress)
    .where(eq(courseProgress.userId, userId))
    .orderBy(desc(courseProgress.updatedAt));
});

/**
 * Problem slugs this user has genuinely solved, from `attempts`.
 *
 * Solved state is shared with the problem library rather than owned by the
 * course: if the app already knows you solved `sql_04_dedupe_submissions`, the
 * course shows it solved, whichever route you got there by.
 */
export const solvedProblemSlugs = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await db
    .selectDistinct({ slug: problems.slug })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")));
  return new Set(rows.map((r) => r.slug));
});

export type ProblemMeta = {
  slug: string;
  title: string;
  kind: string;
  difficulty: string;
  pattern: string | null;
  minutes: number;
};

/** Titles and difficulties for a module's problem list. Absent slugs are dropped. */
export async function problemMeta(slugs: string[]): Promise<Map<string, ProblemMeta>> {
  if (!slugs.length) return new Map();
  const rows = await db
    .select({
      slug: problems.slug, title: problems.title, kind: problems.kind,
      difficulty: problems.difficulty, pattern: problems.pattern, minutes: problems.minutes,
    })
    .from(problems)
    .where(and(inArray(problems.slug, slugs), eq(problems.isPublished, true)));
  return new Map(rows.map((r) => [r.slug, r]));
}

/* ------------------------------------------------------------------ */
/* derivation                                                          */
/* ------------------------------------------------------------------ */

export type Criterion = {
  key: "problems" | "checkpoint" | "attest";
  label: string;
  detail: string;
  met: boolean;
};

export type ModuleStatus = {
  moduleId: string;
  state: "not-started" | "in-progress" | "complete";
  /** Non-optional problems: the ones `all-required-problems` counts. */
  requiredProblems: string[];
  solvedRequired: string[];
  /** Union of genuinely solved and ticked-off, over every problem in the module. */
  doneProblems: Set<string>;
  checkpointRequired: boolean;
  checkpointPassed: boolean;
  checkpointScore: number | null;
  passScore: number;
  attested: boolean;
  criteria: Criterion[];
  /** Every criterion satisfied - i.e. the module *may* be marked complete. */
  meetsCriteria: boolean;
  /** 0..1, for a progress bar. */
  fraction: number;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The one place the completion rules are interpreted.
 *
 * `solved` is the user's genuine solve set from `attempts`; `progress.markedProblems`
 * adds the ones they ticked off inside the module for work done elsewhere. Both
 * are server state - the tick is written by a Server Action, not trusted from a
 * form field on render.
 */
export function moduleStatus(
  module: CourseModule,
  progress: ProgressRow | undefined,
  solved: ReadonlySet<string>,
): ModuleStatus {
  const marked = new Set(progress?.markedProblems ?? []);
  const doneProblems = new Set(
    module.problems.map((p) => p.slug).filter((s) => solved.has(s) || marked.has(s)),
  );

  const requiredProblems = module.problems.filter((p) => !p.optional).map((p) => p.slug);
  const solvedRequired = requiredProblems.filter((s) => doneProblems.has(s));

  const { rule } = module.completion;
  const passScore = module.completion.checkpointPassScore ?? DEFAULT_PASS_SCORE;
  const checkpointRequired = module.completion.requireCheckpoint ?? DEFAULT_REQUIRE_CHECKPOINT;
  const checkpointScore = progress?.checkpointScore ?? null;
  const checkpointPassed = checkpointScore !== null && checkpointScore + 1e-9 >= passScore;
  const attested = progress?.attested ?? false;

  const criteria: Criterion[] = [];

  if (rule === "all-required-problems") {
    criteria.push({
      key: "problems",
      label: "Solve every required problem",
      detail: `${solvedRequired.length} of ${requiredProblems.length} solved`,
      met: requiredProblems.length > 0 && solvedRequired.length === requiredProblems.length,
    });
  } else if (rule === "min-problems") {
    const need = module.completion.minProblemsSolved ?? 1;
    criteria.push({
      key: "problems",
      label: `Solve any ${need} of these problems`,
      detail: `${doneProblems.size} of ${need} solved`,
      met: doneProblems.size >= need,
    });
  } else if (rule === "self-attested") {
    criteria.push({
      key: "attest",
      label: "Confirm you did the work",
      detail: attested ? "Confirmed" : "This one cannot be graded by a machine",
      met: attested,
    });
  }
  // `checkpoint-only` adds nothing here: the checkpoint below is the whole bar.

  if (checkpointRequired) {
    criteria.push({
      key: "checkpoint",
      label: `Pass the checkpoint at ${pct(passScore)}`,
      detail:
        checkpointScore === null
          ? "Not attempted yet"
          : `Scored ${pct(checkpointScore)}`,
      met: checkpointPassed,
    });
  }

  const meetsCriteria = criteria.every((c) => c.met);
  const complete = progress?.status === "complete";

  // A part-done module should read as part-done rather than as untouched, so
  // the bar averages the criteria that exist rather than jumping 0 -> 100.
  const parts = criteria.map((c) => {
    if (c.met) return 1;
    if (c.key === "problems" && rule === "all-required-problems") {
      return requiredProblems.length ? solvedRequired.length / requiredProblems.length : 0;
    }
    if (c.key === "problems" && rule === "min-problems") {
      const need = module.completion.minProblemsSolved ?? 1;
      return Math.min(1, doneProblems.size / need);
    }
    if (c.key === "checkpoint" && checkpointScore !== null) {
      return Math.min(0.99, checkpointScore / (passScore || 1));
    }
    return 0;
  });
  const fraction = complete
    ? 1
    : parts.length
      ? parts.reduce((a, b) => a + b, 0) / parts.length
      : 0;

  const touched =
    complete || attested || checkpointScore !== null || doneProblems.size > 0 || !!progress;

  return {
    moduleId: module.id,
    state: complete ? "complete" : touched ? "in-progress" : "not-started",
    requiredProblems,
    solvedRequired,
    doneProblems,
    checkpointRequired,
    checkpointPassed,
    checkpointScore,
    passScore,
    attested,
    criteria,
    meetsCriteria,
    fraction,
  };
}

export type CourseStatus = {
  statuses: Map<string, ModuleStatus>;
  modulesComplete: number;
  moduleCount: number;
  /** 0..1 across the whole course, part-done modules counted at their fraction. */
  fraction: number;
  /** Any module shows progress - including from problems solved elsewhere. */
  started: boolean;
  /**
   * They have actually opened this course and done something in it. The weaker
   * `started` is true the moment a problem the course happens to reference has
   * been solved anywhere, which is worth showing on a card but is not a claim
   * that anyone can make "where you left off" out of.
   */
  visited: boolean;
  complete: boolean;
  /** Where "continue" goes: the first module that is not complete. */
  nextModule: CourseModule | null;
};

export function courseStatus(
  body: Course,
  progress: Map<string, ProgressRow>,
  solved: ReadonlySet<string>,
): CourseStatus {
  const statuses = new Map<string, ModuleStatus>();
  for (const m of body.modules) statuses.set(m.id, moduleStatus(m, progress.get(m.id), solved));

  const list = [...statuses.values()];
  const modulesComplete = list.filter((s) => s.state === "complete").length;
  const started = list.some((s) => s.state !== "not-started");
  // First incomplete module in course order. The order *is* the curriculum, so
  // "continue" follows it rather than jumping to the most recently touched.
  const nextModule = body.modules.find((m) => statuses.get(m.id)?.state !== "complete") ?? null;

  return {
    statuses,
    modulesComplete,
    moduleCount: body.modules.length,
    fraction: list.length ? list.reduce((a, s) => a + s.fraction, 0) / list.length : 0,
    started,
    visited: progress.size > 0,
    complete: modulesComplete === body.modules.length && body.modules.length > 0,
    nextModule,
  };
}

/* ------------------------------------------------------------------ */
/* checkpoint grading                                                  */
/* ------------------------------------------------------------------ */

/** What the browser is allowed to send: a chosen index, or a self-mark. */
export type SubmittedAnswer = { choice?: number; selfCorrect?: boolean };

/**
 * Grade one checkpoint attempt.
 *
 * `choice` is marked against the stored answer key, which never leaves the
 * server until the attempt is in. `recall` and `explain` are self-marked
 * against the model answer, because "did you reproduce this from memory" is not
 * a thing a machine can check - and pretending otherwise would push the courses
 * towards only the questions that are easy to grade.
 */
export function gradeCheckpoint(
  module: CourseModule,
  submitted: Record<string, SubmittedAnswer>,
): { score: number; answers: Record<string, { correct: boolean }>; answered: number } {
  const answers: Record<string, { correct: boolean }> = {};
  let answered = 0;

  for (const q of module.checkpoint.questions) {
    const given = submitted[q.id];
    if (q.kind === "choice") {
      const picked = given?.choice;
      if (picked !== undefined) answered++;
      answers[q.id] = { correct: picked !== undefined && picked === q.answer };
    } else {
      if (given?.selfCorrect !== undefined) answered++;
      answers[q.id] = { correct: given?.selfCorrect === true };
    }
  }

  const total = module.checkpoint.questions.length;
  const correct = Object.values(answers).filter((a) => a.correct).length;
  return { score: total ? correct / total : 0, answers, answered };
}

/* ------------------------------------------------------------------ */
/* the dashboard prompt                                                */
/* ------------------------------------------------------------------ */

export type ContinuePrompt = {
  courseSlug: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  moduleNumber: number;
  moduleCount: number;
  modulesComplete: number;
  fraction: number;
  estimatedMinutes: number;
};

/**
 * The single course worth nagging about: the one they touched most recently
 * that is not finished. Returns null rather than inventing a suggestion - a
 * dashboard that tells someone to "continue" a course they never started is
 * noise.
 */
export async function continueCourse(userId: string): Promise<ContinuePrompt | null> {
  const rows = await allProgress(userId);
  if (!rows.length) return null;

  const solved = await solvedProblemSlugs(userId);
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.courseSlug)) continue;
    seen.add(row.courseSlug);

    const loaded = await getCourse(row.courseSlug);
    if (!loaded) continue;

    const progress = await progressForCourse(userId, row.courseSlug);
    const status = courseStatus(loaded.body, progress, solved);
    if (status.complete || !status.nextModule) continue;

    const index = loaded.body.modules.findIndex((m) => m.id === status.nextModule?.id);
    return {
      courseSlug: loaded.body.slug,
      courseTitle: loaded.body.title,
      moduleId: status.nextModule.id,
      moduleTitle: status.nextModule.title,
      moduleNumber: index + 1,
      moduleCount: status.moduleCount,
      modulesComplete: status.modulesComplete,
      fraction: status.fraction,
      estimatedMinutes: status.nextModule.estimatedMinutes,
    };
  }
  return null;
}
