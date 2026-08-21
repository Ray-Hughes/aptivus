"use server";

/**
 * Every mutation the course pages make.
 *
 * The rules all of these share:
 *
 * - the user id comes from the session, never from the form. A form field
 *   naming a user id would be an invitation to write someone else's progress;
 * - the course and module come out of the database, not out of the request, so
 *   a POST naming a module that does not exist is a 404 rather than a row;
 * - completion is re-derived from `moduleStatus` before `status = 'complete'`
 *   is written. The button is hidden when the criteria are unmet, but hiding a
 *   button is a UI courtesy, not a control.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { courseProgress } from "@/db/schema";
import { fail, ok, type ActionState } from "@/lib/forms";
import {
  getCourse,
  gradeCheckpoint,
  moduleStatus,
  solvedProblemSlugs,
  type CourseModule,
  type ProgressRow,
} from "@/lib/courses";

const Slug = z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const ProblemSlug = z.string().trim().regex(/^[a-z0-9][a-z0-9_]*$/).max(80);
const Target = z.object({ courseSlug: Slug, moduleId: Slug });

const now = () => Math.floor(Date.now() / 1000);

class ActionError extends Error {}

/**
 * Resolve session + course + module + the current progress row in one place.
 * Throws `ActionError` with a message safe to show the user.
 */
async function context(raw: { courseSlug: unknown; moduleId: unknown }): Promise<{
  userId: string;
  courseSlug: string;
  mod: CourseModule;
  progress: ProgressRow | undefined;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ActionError("Sign in to track your progress.");

  const parsed = Target.safeParse(raw);
  if (!parsed.success) throw new ActionError("That request was not valid.");

  const loaded = await getCourse(parsed.data.courseSlug);
  if (!loaded) throw new ActionError("No such course.");

  const mod = loaded.body.modules.find((m) => m.id === parsed.data.moduleId);
  if (!mod) throw new ActionError("No such module.");

  const [progress] = await db
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.courseSlug, parsed.data.courseSlug),
        eq(courseProgress.moduleId, mod.id),
      ),
    )
    .limit(1);

  return { userId, courseSlug: parsed.data.courseSlug, mod, progress };
}

/** Create the row if this is the first thing the learner has done here. */
async function ensureRow(userId: string, courseSlug: string, moduleId: string) {
  await db
    .insert(courseProgress)
    .values({ userId, courseSlug, moduleId, status: "started" })
    .onConflictDoNothing();
}

type Patch = Partial<Omit<ProgressRow, "id" | "userId" | "courseSlug" | "moduleId">>;

async function write(userId: string, courseSlug: string, moduleId: string, patch: Patch) {
  await ensureRow(userId, courseSlug, moduleId);
  await db
    .update(courseProgress)
    .set({ ...patch, updatedAt: now() })
    .where(
      and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.courseSlug, courseSlug),
        eq(courseProgress.moduleId, moduleId),
      ),
    );
  touch(courseSlug, moduleId);
}

function touch(courseSlug: string, moduleId: string) {
  revalidatePath(`/courses/${courseSlug}/${moduleId}`);
  revalidatePath(`/courses/${courseSlug}`);
  revalidatePath("/courses");
  revalidatePath("/dashboard");
}

function guard(error: unknown): ActionState {
  if (error instanceof ActionError) return fail(error.message);
  console.error("[courses]", error);
  return fail("Something went wrong. The error was logged.");
}

/* ------------------------------------------------------------------ */
/* starting                                                            */
/* ------------------------------------------------------------------ */

/**
 * "Start" and "continue where you left off" are the same action: record that
 * the module is underway and go there. The target module is chosen by the
 * server-rendered page, and re-checked here.
 */
export async function startModule(formData: FormData): Promise<void> {
  const raw = { courseSlug: formData.get("courseSlug"), moduleId: formData.get("moduleId") };
  let target: { userId: string; courseSlug: string; moduleId: string };
  try {
    const { userId, courseSlug, mod } = await context(raw);
    target = { userId, courseSlug, moduleId: mod.id };
  } catch {
    // Signed out, or a stale link to a module that no longer exists. Either way
    // the catalogue is a better answer than an error page.
    redirect("/courses");
  }
  await ensureRow(target.userId, target.courseSlug, target.moduleId);
  touch(target.courseSlug, target.moduleId);
  redirect(`/courses/${target.courseSlug}/${target.moduleId}`);
}

/* ------------------------------------------------------------------ */
/* problems                                                            */
/* ------------------------------------------------------------------ */

/**
 * Tick a problem off inside a module.
 *
 * This is *not* how a problem becomes solved - solving it in the workbench is,
 * and that state comes from `attempts` wherever it happened. This is for work
 * done off the platform, and for the modules that ask you to re-solve something
 * from a blank editor. The UI labels the two differently, because a tick you
 * gave yourself and a solve the grader saw are not the same claim.
 */
export async function toggleProblem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = z
      .object({ problemSlug: ProblemSlug, done: z.enum(["true", "false"]) })
      .safeParse({ problemSlug: formData.get("problemSlug"), done: formData.get("done") });
    if (!parsed.success) return fail("That request was not valid.");

    const { userId, courseSlug, mod, progress } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });

    // Only problems this module actually lists. Otherwise the column becomes a
    // free-text store that anyone with a fetch call can write to.
    if (!mod.problems.some((p) => p.slug === parsed.data.problemSlug)) {
      return fail("That problem is not part of this module.");
    }

    const current = new Set(progress?.markedProblems ?? []);
    const done = parsed.data.done === "true";
    if (done) current.add(parsed.data.problemSlug);
    else current.delete(parsed.data.problemSlug);

    await write(userId, courseSlug, mod.id, { markedProblems: [...current] });
    return ok(done ? "Ticked off." : "Unticked.");
  } catch (error) {
    return guard(error);
  }
}

/* ------------------------------------------------------------------ */
/* checkpoint                                                          */
/* ------------------------------------------------------------------ */

const AnswerMap = z.record(
  z.string().max(80),
  z.object({
    choice: z.number().int().min(0).max(50).optional(),
    selfCorrect: z.boolean().optional(),
  }),
);

/**
 * Grade a checkpoint attempt.
 *
 * `choice` questions are marked here against the stored answer key - the key is
 * never in the page before the attempt is in, so there is nothing to read out
 * of the bundle. `recall` and `explain` are self-marked; the form sends the
 * learner's own verdict and it is stored as exactly that.
 *
 * Only the latest attempt is kept, which is the whole of what the format says
 * to store. Attempt history is not interesting; the current state is.
 */
export async function submitCheckpoint(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { userId, courseSlug, mod } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });

    const submitted: Record<string, { choice?: number; selfCorrect?: boolean }> = {};
    for (const q of mod.checkpoint.questions) {
      if (q.kind === "choice") {
        const raw = formData.get(`choice:${q.id}`);
        if (raw === null) continue;
        const n = Number(raw);
        if (Number.isInteger(n)) submitted[q.id] = { choice: n };
      } else {
        const raw = formData.get(`self:${q.id}`);
        if (raw === null) continue;
        submitted[q.id] = { selfCorrect: raw === "yes" };
      }
    }

    const answers = AnswerMap.safeParse(submitted);
    if (!answers.success) return fail("That request was not valid.");

    const graded = gradeCheckpoint(mod, answers.data);
    if (graded.answered < mod.checkpoint.questions.length) {
      return fail(
        `Answer all ${mod.checkpoint.questions.length} questions - ` +
          `${mod.checkpoint.questions.length - graded.answered} still blank.`,
      );
    }

    await write(userId, courseSlug, mod.id, {
      checkpointScore: graded.score,
      checkpointAt: now(),
      checkpointAnswers: graded.answers,
    });

    const passScore = mod.completion.checkpointPassScore ?? 0.8;
    return ok(
      graded.score + 1e-9 >= passScore
        ? `Passed: ${Math.round(graded.score * 100)}%.`
        : `Scored ${Math.round(graded.score * 100)}%, and the bar is ${Math.round(passScore * 100)}%.`,
    );
  } catch (error) {
    return guard(error);
  }
}

/** Clear the last attempt so it can be taken again. */
export async function retakeCheckpoint(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { userId, courseSlug, mod } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });
    await write(userId, courseSlug, mod.id, {
      checkpointScore: null,
      checkpointAt: null,
      checkpointAnswers: null,
    });
    return ok("Cleared. Take it again.");
  } catch (error) {
    return guard(error);
  }
}

/* ------------------------------------------------------------------ */
/* attestation and completion                                          */
/* ------------------------------------------------------------------ */

/**
 * For `self-attested` modules: drawing a diagram from memory, running a mock
 * out loud, playing back a recording. None of it can be graded by a machine and
 * pretending otherwise would push the courses towards only what is easy to
 * measure. The learner says they did it; the app takes them at their word and
 * says so plainly on the page.
 */
export async function attestModule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = z
      .object({ attested: z.enum(["true", "false"]) })
      .safeParse({ attested: formData.get("attested") });
    if (!parsed.success) return fail("That request was not valid.");

    const { userId, courseSlug, mod } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });
    const attested = parsed.data.attested === "true";
    await write(userId, courseSlug, mod.id, { attested });
    return ok(attested ? "Noted - you did the work." : "Withdrawn.");
  } catch (error) {
    return guard(error);
  }
}

/**
 * Mark a module complete - if, and only if, its own completion rule says so.
 * The rule is re-derived here from the stored course and the stored progress,
 * so this is the same computation the page did, run again against a request we
 * did not render.
 */
export async function completeModule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { userId, courseSlug, mod, progress } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });

    const solved = await solvedProblemSlugs(userId);
    const status = moduleStatus(mod, progress, solved);
    if (!status.meetsCriteria) {
      const missing = status.criteria.find((c) => !c.met);
      return fail(missing ? `Not yet - ${missing.label.toLowerCase()}.` : "Not yet.");
    }

    await write(userId, courseSlug, mod.id, { status: "complete", completedAt: now() });
    return ok("Module complete.");
  } catch (error) {
    return guard(error);
  }
}

/** Undo a completion. Someone who wants to redo a module should be able to. */
export async function reopenModule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { userId, courseSlug, mod } = await context({
      courseSlug: formData.get("courseSlug"),
      moduleId: formData.get("moduleId"),
    });
    await write(userId, courseSlug, mod.id, { status: "started", completedAt: null });
    return ok("Reopened.");
  } catch (error) {
    return guard(error);
  }
}
