/**
 * POST /api/tracks - design a roadmap for one person's actual job.
 *
 * The roadmap is generated inline rather than in the background: it is one
 * model call, the user is watching, and the result is the thing that decides
 * whether they believe the product understands their job.
 */
import { auth } from "@/auth";
import { fail, isResponse, json, readBody, unauthorized } from "@/lib/api";
import { COST, spend, summary } from "@/lib/entitlements";
import { FLAGS, isEnabled } from "@/lib/flags";
import { rateLimit } from "@/lib/ratelimit";
import { CreateTrack, createTrack } from "@/lib/tracks";

// One Opus call at high effort. The default would time out mid-roadmap and
// leave the user staring at a network error for something that was working.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  if (!(await isEnabled(FLAGS.languageTracks, userId))) return fail(404, "Not found.");

  // A speed bump, not the cost control - this limiter is per process, so on
  // serverless it only catches a burst that happens to land on one instance.
  // The real guard is the gem charge below, which is per account.
  const gate = rateLimit(`track:${userId}`, 5, 60 * 60 * 1000);
  if (!gate.ok) return fail(429, "That is a lot of roadmaps in one hour. Try again shortly.");

  const body = await readBody(request, CreateTrack);
  if (isResponse(body)) return body;

  // Checked before generating and charged after, so a model failure never
  // takes someone's gems. A user racing two tabs can get one roadmap free;
  // that is a far better bug than charging for nothing.
  const ent = await summary(userId);
  if (!ent.pro && ent.gems < COST.generation) {
    return fail(402, `A roadmap costs ${COST.generation} gems, and you have ${ent.gems}.`, {
      balance: ent.gems, cost: COST.generation,
    });
  }

  const result = await createTrack(userId, body);
  if (!result.ok) return fail(422, result.message);

  await spend(userId, "generation");
  return json({ trackId: result.trackId }, 201);
}
