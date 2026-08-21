/**
 * POST /api/problems/[slug]/solution - reveal the reference solution and the
 * write-up, metered.
 *
 * Body: `{ "language": "javascript" }` (optional; defaults to the problem's
 * first available language).
 *
 * One deliberate exception to the metering, from `phase-2-plan.md` §5: **once
 * you have solved it, the solution is free.** Metering the moment a learner
 * most needs the explanation monetises giving up and teaches them not to look;
 * metering only the pre-solve reveal keeps the revenue and drops the perverse
 * incentive. A reveal earned that way is recorded with `paid_with = "earned"`.
 *
 * Anything else goes through `spend()` and returns 402 with the remaining
 * allowance when the user cannot pay.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { attempts, reveals } from "@/db/schema";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { COST, spend, summary } from "@/lib/entitlements";
import { lockedByLiveRound, wasInFinishedRound } from "@/lib/mock";
import { bindingOf, findProblem, languagesOf } from "@/lib/problems";

const Body = z.object({
  language: z.enum(["python", "javascript", "ruby", "sql"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const { slug } = await params;
  const found = await findProblem(slug);
  if (!found) return notFound("No such problem.");

  // Closed for the duration of a round, and closed to a curl too. See
  // `lockedByLiveRound` - the promise is only worth making if it is enforced
  // somewhere the UI cannot be edited around.
  if (await lockedByLiveRound(userId, found.row.id)) {
    return json(
      {
        error: "Solutions are closed for the duration of a mock round. They unlock free on the scorecard.",
        locked: "mock_round",
      },
      403,
    );
  }

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const available = languagesOf(found.body);
  const language = body.language ?? available[0];
  if (!language || !available.includes(language)) {
    return json({ error: "No reference solution in that language.", languages: available }, 400);
  }
  const binding = bindingOf(found.body, language);
  if (!binding) return notFound("No reference solution in that language.");

  // Already solved it? Then it is theirs.
  const [solved] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.problemId, found.row.id),
        eq(attempts.status, "solved"),
      ),
    )
    .limit(1);

  // After a mock round, both write-ups are free whatever the outcome. The
  // moment after a round you just lost is the highest-learning moment in the
  // product; charging for it monetises giving up at exactly the wrong time.
  const finishedMock = solved ? false : await wasInFinishedRound(userId, found.row.id);

  let paidWith: string;
  if (solved || finishedMock) {
    await db
      .insert(reveals)
      .values({ userId, problemId: found.row.id, kind: "solution", level: 0, paidWith: "earned" })
      .onConflictDoNothing();
    paidWith = "earned";
  } else {
    const result = await spend(userId, "solution", { problemId: found.row.id, level: 0 });
    if (!result.ok) {
      return json(
        {
          error: "Out of solutions for today.",
          cost: result.cost,
          balance: result.balance,
          remainingFree: result.remainingFree,
          upgrade: "/settings#plan",
          entitlements: await summary(userId),
        },
        402,
      );
    }
    paidWith = result.paidWith;
  }

  return json({
    language,
    solution: binding.solution,
    notes: binding.notes ?? "",
    explanation: found.body.explanation,
    complexity: found.body.complexity ?? "",
    languages: available,
    paidWith,
    cost: paidWith === "gem" ? COST.solution : 0,
    entitlements: await summary(userId),
  });
}
