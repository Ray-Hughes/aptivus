/**
 * POST .../solution - the finished code, metered.
 */
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { trackProgress } from "@/db/schema";
import { fail, json, notFound, unauthorized } from "@/lib/api";
import { spend } from "@/lib/entitlements";
import { ensureLessonWritten, loadOwnedLesson } from "@/lib/tracks";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const { lessonId } = await params;
  const found = await loadOwnedLesson(lessonId, userId);
  if (!found) return notFound("No such lesson.");

  const written = await ensureLessonWritten(found.lesson, found.track);
  if (!written.ok) return fail(503, written.message);

  const [progress] = await db
    .select()
    .from(trackProgress)
    .where(and(eq(trackProgress.userId, userId), eq(trackProgress.lessonId, lessonId)))
    .limit(1);

  if (!progress?.solutionRevealed) {
    const result = await spend(userId, "solution");
    if (!result.ok) {
      return fail(402, "You are out of free solutions and gems for now.", {
        balance: result.balance, cost: result.cost,
      });
    }
    const now = Math.floor(Date.now() / 1000);
    if (progress) {
      await db.update(trackProgress).set({ solutionRevealed: true, updatedAt: now })
        .where(and(eq(trackProgress.userId, userId), eq(trackProgress.lessonId, lessonId)));
    } else {
      await db.insert(trackProgress).values({ userId, lessonId, solutionRevealed: true, updatedAt: now });
    }
  }

  return json({ solution: written.lesson.solution });
}
