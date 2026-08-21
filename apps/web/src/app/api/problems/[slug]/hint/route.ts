/**
 * POST /api/problems/[slug]/hint - reveal one hint, metered.
 *
 * Body: `{ "level": 0 }`, indexing into the problem's hint list.
 *
 * The spend order lives in `spend()`: already-unlocked, then Pro, then the free
 * daily allowance, then gems. When none of those can pay, this returns **402
 * Payment Required** with the remaining allowance and the balance, so the UI
 * can say exactly what is missing rather than "something went wrong".
 *
 * Re-opening a hint already paid for is free forever - that is what the
 * `reveals` table is for.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { COST, spend, summary } from "@/lib/entitlements";
import { lockedByLiveRound } from "@/lib/mock";
import { findProblem } from "@/lib/problems";

const Body = z.object({ level: z.int().nonnegative().max(20).default(0) });

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

  // The mock-interview contract, enforced rather than merely displayed. The
  // pre-round screen promises no hints; hiding the button is a UI decision,
  // this is the promise. It has to hold for a curl too, or it is not one.
  if (await lockedByLiveRound(userId, found.row.id)) {
    return json(
      {
        error: "Hints are closed for the duration of a mock round. That is the contract you started under.",
        locked: "mock_round",
      },
      403,
    );
  }

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const hints = found.body.hints;
  if (body.level >= hints.length) {
    return notFound(`This problem has ${hints.length} hints.`);
  }

  const result = await spend(userId, "hint", { problemId: found.row.id, level: body.level });
  if (!result.ok) {
    return json(
      {
        error: "Out of hints for today.",
        cost: result.cost,
        balance: result.balance,
        remainingFree: result.remainingFree,
        upgrade: "/settings#plan",
        entitlements: await summary(userId),
      },
      402,
    );
  }

  return json({
    level: body.level,
    hint: hints[body.level],
    hintCount: hints.length,
    paidWith: result.paidWith,
    cost: result.paidWith === "gem" ? COST.hint : 0,
    entitlements: await summary(userId),
  });
}
