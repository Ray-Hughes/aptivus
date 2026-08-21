/**
 * POST .../progress - save the learner's work, and mark the lesson done.
 *
 * Completion is asserted by the browser, which is fine precisely because it
 * buys nothing: lesson completion awards no gems and unlocks no content. The
 * only thing a false "complete" costs is the liar's own progress bar.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { trackProgress } from "@/db/schema";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { loadOwnedLesson } from "@/lib/tracks";

const Body = z.object({
  code: z.string().max(20_000).optional(),
  complete: z.boolean().optional(),
  attempted: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { lessonId } = await params;
  const found = await loadOwnedLesson(lessonId, session.user.id);
  if (!found) return notFound("No such lesson.");

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const now = Math.floor(Date.now() / 1000);
  const [existing] = await db
    .select()
    .from(trackProgress)
    .where(and(eq(trackProgress.userId, session.user.id), eq(trackProgress.lessonId, lessonId)))
    .limit(1);

  const attempts = (existing?.attempts ?? 0) + (body.attempted ? 1 : 0);
  // Completion is sticky: a learner who solves it and then breaks their own
  // code while poking at it has not un-learned the lesson.
  const status = body.complete || existing?.status === "complete" ? "complete" : "started";
  const completedAt = status === "complete" ? (existing?.completedAt ?? now) : null;

  if (existing) {
    await db
      .update(trackProgress)
      .set({
        code: body.code ?? existing.code,
        attempts, status, completedAt, updatedAt: now,
      })
      .where(and(eq(trackProgress.userId, session.user.id), eq(trackProgress.lessonId, lessonId)));
  } else {
    await db.insert(trackProgress).values({
      userId: session.user.id, lessonId,
      code: body.code ?? null, attempts, status, completedAt, updatedAt: now,
    });
  }

  return json({ status, attempts });
}
