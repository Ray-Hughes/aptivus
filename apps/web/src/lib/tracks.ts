import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { languageTracks, profiles, trackLessons, trackProgress } from "@/db/schema";
import { failureMessage } from "./ai";
import {
  LANGUAGE_LABEL, type Lesson, type Roadmap, type Runnable,
  generateLesson, generateRoadmap,
} from "./track-gen";
import { verifyLesson } from "./lesson-verify";

/**
 * The server side of a language track: create it, fill it in, hand it out.
 *
 * Generation is split in two on purpose. The roadmap is one call and the user
 * waits for it, because the roadmap IS the product pitch - it is where they see
 * their own job reflected back and decide whether to trust the thing. Lessons
 * are written one at a time when first opened, so nobody waits several minutes
 * for twelve lessons they may never reach, and we do not pay to write them.
 */

/**
 * RUNNABLE lists what the engine can execute; this lists what we can execute
 * AND verify AND syntax-highlight. Ruby is in the first list and not this one:
 * there is no Ruby runtime on the server, so every Ruby lesson would fail
 * verification and never be shown. Offering it would sell an empty track.
 */
export const TARGETABLE = ["python", "javascript"] as const satisfies readonly Runnable[];

export const CreateTrack = z.object({
  targetLanguage: z.enum(TARGETABLE),
  jobTitle: z.string().trim().min(4).max(120),
  jobContext: z.string().trim().max(4000).optional(),
  knownLanguages: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
});
export type CreateTrackInput = z.infer<typeof CreateTrack>;

export type TrackRow = typeof languageTracks.$inferSelect;
export type LessonRow = typeof trackLessons.$inferSelect;

/** A lesson row whose body has actually been written and verified. */
export const isWritten = (row: LessonRow) =>
  Boolean(row.verifiedAt) && Boolean((row.body as Partial<Lesson>)?.teaching);

/* ------------------------------------------------------------------ */
/* creating                                                            */
/* ------------------------------------------------------------------ */

/**
 * What the learner already knows. Explicit input wins; otherwise their profile
 * expertise; otherwise their primary language. Never the target itself - a
 * roadmap that compares Go to Go teaches nothing.
 */
export async function knownFor(userId: string, target: string, explicit?: string[]) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const expertise = profile?.expertise ?? [];
  const fromProfile = expertise.map((e) => e.language);
  const known = (explicit?.length ? explicit : fromProfile.length ? fromProfile : [profile?.primaryLanguage ?? "python"])
    .filter((l) => l && l !== target);
  return { known: [...new Set(known)], expertise: expertise.filter((e) => e.language !== target) };
}

export type CreateResult =
  | { ok: true; trackId: string }
  | { ok: false; message: string };

export async function createTrack(userId: string, input: CreateTrackInput): Promise<CreateResult> {
  const { known, expertise } = await knownFor(userId, input.targetLanguage, input.knownLanguages);
  if (!known.length) {
    return { ok: false, message: "Tell us a language you already know first - these lessons teach by comparison." };
  }

  const roadmap = await generateRoadmap({
    targetLanguage: input.targetLanguage,
    knownLanguages: known,
    expertise,
    jobTitle: input.jobTitle,
    jobContext: input.jobContext,
  });
  if (!roadmap.ok) return { ok: false, message: failureMessage(roadmap.failure) };

  const [track] = await db
    .insert(languageTracks)
    .values({
      userId,
      targetLanguage: input.targetLanguage,
      knownLanguages: known,
      jobTitle: input.jobTitle,
      jobContext: input.jobContext ?? null,
      rationale: roadmap.value.rationale,
      status: "ready",
      readyAt: Math.floor(Date.now() / 1000),
    })
    .returning({ id: languageTracks.id });

  await db.insert(trackLessons).values(
    roadmap.value.lessons.map((l, i) => ({
      trackId: track.id,
      position: i + 1,
      title: l.title,
      relevance: l.relevance,
      estimatedMinutes: l.estimatedMinutes,
      // The spec only. The lesson itself is written when someone opens it.
      body: { spec: l } as unknown as Record<string, unknown>,
    })),
  );

  return { ok: true, trackId: track.id };
}

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

export async function listTracks(userId: string) {
  const tracks = await db
    .select()
    .from(languageTracks)
    .where(eq(languageTracks.userId, userId))
    .orderBy(desc(languageTracks.createdAt));
  if (!tracks.length) return [];

  const lessons = await db.select().from(trackLessons);
  const done = await db
    .select()
    .from(trackProgress)
    .where(and(eq(trackProgress.userId, userId), eq(trackProgress.status, "complete")));
  const doneIds = new Set(done.map((d) => d.lessonId));

  return tracks.map((t) => {
    const mine = lessons.filter((l) => l.trackId === t.id);
    return {
      ...t,
      total: mine.length,
      completed: mine.filter((l) => doneIds.has(l.id)).length,
    };
  });
}

export async function loadOwnedTrack(trackId: string, userId: string) {
  const [track] = await db
    .select()
    .from(languageTracks)
    .where(and(eq(languageTracks.id, trackId), eq(languageTracks.userId, userId)))
    .limit(1);
  return track ?? null;
}

export async function loadTrackLessons(trackId: string, userId: string) {
  const lessons = await db
    .select()
    .from(trackLessons)
    .where(eq(trackLessons.trackId, trackId))
    .orderBy(asc(trackLessons.position));
  const progress = await db
    .select()
    .from(trackProgress)
    .where(eq(trackProgress.userId, userId));
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  return lessons.map((l) => ({ lesson: l, progress: byLesson.get(l.id) ?? null }));
}

export async function loadOwnedLesson(lessonId: string, userId: string) {
  const [lesson] = await db.select().from(trackLessons).where(eq(trackLessons.id, lessonId)).limit(1);
  if (!lesson) return null;
  const track = await loadOwnedTrack(lesson.trackId, userId);
  if (!track) return null;
  return { lesson, track };
}

/* ------------------------------------------------------------------ */
/* writing a lesson                                                    */
/* ------------------------------------------------------------------ */

export type WriteResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; message: string };

/**
 * Write the lesson if it has not been written, and never hand back one whose
 * own reference solution failed its own tests.
 *
 * Two attempts, because the common failure is a lesson whose expected values
 * are off by one case rather than a model that cannot do the task at all, and
 * the second attempt usually lands. Three would be paying real money to watch
 * the same mistake.
 */
export async function ensureLessonWritten(
  lesson: LessonRow,
  track: TrackRow,
): Promise<WriteResult> {
  if (isWritten(lesson)) return { ok: true, lesson: lesson.body as Lesson };

  const body = lesson.body as { spec?: Roadmap["lessons"][number] };
  const spec = body?.spec ?? {
    title: lesson.title,
    relevance: lesson.relevance,
    concepts: [lesson.title],
    estimatedMinutes: lesson.estimatedMinutes,
  };
  const total = await db.$count(trackLessons, eq(trackLessons.trackId, track.id));
  const { expertise } = await knownFor(track.userId, track.targetLanguage);

  let lastReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const written = await generateLesson({
      targetLanguage: track.targetLanguage,
      knownLanguages: track.knownLanguages ?? [],
      expertise,
      jobTitle: track.jobTitle,
      spec,
      position: lesson.position,
      total,
    });
    if (!written.ok) {
      await db.update(trackLessons)
        .set({ verifyError: failureMessage(written.failure) })
        .where(eq(trackLessons.id, lesson.id));
      return { ok: false, message: failureMessage(written.failure) };
    }

    const check = await verifyLesson(track.targetLanguage, written.value);
    if (check.ok) {
      await db
        .update(trackLessons)
        .set({
          title: written.value.title,
          relevance: written.value.relevance,
          estimatedMinutes: written.value.estimatedMinutes,
          body: written.value as unknown as Record<string, unknown>,
          verifiedAt: Math.floor(Date.now() / 1000),
          verifyError: null,
        })
        .where(eq(trackLessons.id, lesson.id));
      return { ok: true, lesson: written.value };
    }
    lastReason = check.reason;
  }

  await db.update(trackLessons).set({ verifyError: lastReason }).where(eq(trackLessons.id, lesson.id));
  return {
    ok: false,
    // Said plainly. A learner who cannot tell "I am wrong" from "the lesson is
    // wrong" stops trusting every lesson, including the correct ones.
    message: `We wrote this lesson twice and it failed its own tests both times, so we are not showing it. (${lastReason})`,
  };
}

/**
 * What the browser is allowed to see before the learner has paid for it.
 * Hints and the solution are metered, so they are stripped here and served
 * one at a time by their own routes.
 */
export function publicLesson(lesson: Lesson, unlocked: { hints: number; solution: boolean }) {
  return {
    title: lesson.title,
    relevance: lesson.relevance,
    estimatedMinutes: lesson.estimatedMinutes,
    teaching: lesson.teaching,
    func: lesson.func,
    scaffold: lesson.scaffold,
    hintCount: lesson.hints.length,
    hints: lesson.hints.slice(0, unlocked.hints),
    solution: unlocked.solution ? lesson.solution : null,
    // Lesson tests run in the learner's own browser, expected values included.
    // This is practice, not assessment: nothing here awards gems or counts
    // toward anything, so there is nothing to gain by faking a pass.
    tests: lesson.tests,
  };
}

export const languageLabel = (slug: string) => LANGUAGE_LABEL[slug] ?? slug;
