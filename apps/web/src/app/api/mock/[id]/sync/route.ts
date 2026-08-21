/**
 * POST /api/mock/[id]/sync - the round's heartbeat.
 *
 * The browser sends what it saw (activity blocks, run markers, the code as it
 * stands) and gets back what the clock actually says. Nothing here can end a
 * round or mark anything solved: those are the other two routes, and solving
 * only ever happens through the server-side grader.
 */
import { auth } from "@/auth";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { SyncBody, applySync, loadOwnedRound } from "@/lib/mock-sync";

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

  if (round.status !== "in_progress") {
    return json({ elapsed: (round.endedAt ?? round.startedAt) - round.startedAt,
                  durationSeconds: round.durationSeconds, status: round.status });
  }

  return json(await applySync(round, body));
}
