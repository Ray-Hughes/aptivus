/**
 * POST /api/tracks/[id]/lessons/[lessonId] - hand back the lesson, writing it
 * first if this is the first time anyone has opened it.
 *
 * POST rather than GET because the first call has a side effect and a cost.
 */
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { trackProgress } from "@/db/schema";
import { fail, json, notFound, unauthorized } from "@/lib/api";
import { ensureLessonWritten, loadOwnedLesson, publicLesson } from "@/lib/tracks";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { lessonId } = await params;
  const found = await loadOwnedLesson(lessonId, session.user.id);
  if (!found) return notFound("No such lesson.");

  const written = await ensureLessonWritten(found.lesson, found.track);
  if (!written.ok) return fail(503, written.message);

  const [progress] = await db
    .select()
    .from(trackProgress)
    .where(and(eq(trackProgress.userId, session.user.id), eq(trackProgress.lessonId, lessonId)))
    .limit(1);

  return json({
    lesson: publicLesson(written.lesson, {
      hints: progress?.hintsUsed ?? 0,
      solution: Boolean(progress?.solutionRevealed),
    }),
    progress: {
      status: progress?.status ?? "started",
      code: progress?.code ?? null,
      hintsUsed: progress?.hintsUsed ?? 0,
      solutionRevealed: Boolean(progress?.solutionRevealed),
      attempts: progress?.attempts ?? 0,
    },
  });
}
