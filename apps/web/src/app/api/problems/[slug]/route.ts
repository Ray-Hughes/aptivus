/**
 * GET /api/problems/[slug] - everything needed to attempt a problem, and
 * nothing that is paid for.
 *
 * Sample tests travel; hidden tests do not, only their count. No reference
 * solution, no hint text, no write-up. See `toPublic` in `@/lib/problems` for
 * the single place that decision is made.
 */
import { auth } from "@/auth";
import { json, notFound } from "@/lib/api";
import { FLAGS, isEnabled } from "@/lib/flags";
import { findProblem, toPublic } from "@/lib/problems";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const found = await findProblem(slug);
  if (!found) return notFound("No such problem.");
  const session = await auth();
  const companyPacks = await isEnabled(FLAGS.companyPacks, session?.user?.id ?? null);
  return json({ problem: toPublic(found, companyPacks) });
}
