/**
 * POST /api/mock/[id]/end - stop the clock.
 *
 * `ended_at` is the server's own `now`, exactly like `started_at` was. That is
 * the reason the scorecard's clock is worth reading: both ends of the
 * subtraction come from here, so closing the laptop costs you the time rather
 * than saving it. A final sync rides along in the same request so the last few
 * seconds of the trace are not lost to a race with the heartbeat.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auth } from "@/auth";
import { mockRounds } from "@/db/schema";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { SyncBody, applySync, loadOwnedRound, serverNow } from "@/lib/mock-sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;
  const round = await loadOwnedRound(id, session.user.id);
  if (!round) return notFound("No such round.");

  const body = await readBody(request, SyncBody);
  if (isResponse(body)) return body;

  // Already ended: idempotent, so a double-click or a retry is harmless.
  if (round.status !== "in_progress") {
    return json({ ok: true, scorecard: `/mock/${round.id}/scorecard`, alreadyEnded: true });
  }

  const at = serverNow();
  await applySync(round, body, at);
  await db
    .update(mockRounds)
    .set({ status: "ended", endedAt: at })
    .where(eq(mockRounds.id, round.id));

  return json({ ok: true, scorecard: `/mock/${round.id}/scorecard`, elapsed: at - round.startedAt });
}
