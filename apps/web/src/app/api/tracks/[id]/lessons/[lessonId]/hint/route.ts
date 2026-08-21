/**
 * POST .../hint - one hint, metered.
 *
 * Hints already paid for on this lesson are free forever. Charging twice for
 * the same sentence is the sort of thing people notice and never forgive.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { trackProgress } from "@/db/schema";
import { fail, isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { spend } from "@/lib/entitlements";
import { ensureLessonWritten, loadOwnedLesson } from "@/lib/tracks";

const Body = z.object({ level: z.number().int().min(0).max(2) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const { lessonId } = await params;
  const found = await loadOwnedLesson(lessonId, userId);
  if (!found) return notFound("No such lesson.");

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const written = await ensureLessonWritten(found.lesson, found.track);
  if (!written.ok) return fail(503, written.message);
  const hint = written.lesson.hints[body.level];
  if (!hint) return notFound("No hint at that level.");

  const [progress] = await db
    .select()
    .from(trackProgress)
    .where(and(eq(trackProgress.userId, userId), eq(trackProgress.lessonId, lessonId)))
    .limit(1);
  const alreadyUnlocked = (progress?.hintsUsed ?? 0) > body.level;

  if (!alreadyUnlocked) {
    const result = await spend(userId, "hint");
    if (!result.ok) {
      return fail(402, "You are out of free hints and gems for now.", {
        balance: result.balance, cost: result.cost,
      });
    }
    const now = Math.floor(Date.now() / 1000);
    const hintsUsed = body.level + 1;
    if (progress) {
      await db.update(trackProgress).set({ hintsUsed, updatedAt: now })
        .where(and(eq(trackProgress.userId, userId), eq(trackProgress.lessonId, lessonId)));
    } else {
      await db.insert(trackProgress).values({ userId, lessonId, hintsUsed, updatedAt: now });
    }
  }

  return json({ level: body.level, hint, hintsUsed: Math.max(progress?.hintsUsed ?? 0, body.level + 1) });
}
