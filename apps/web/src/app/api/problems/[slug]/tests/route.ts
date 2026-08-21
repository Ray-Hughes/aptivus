/**
 * GET /api/problems/[slug]/tests - the hidden test INPUTS, never their
 * expected outputs.
 *
 * The code runs in the browser, so the inputs have to travel. The expected
 * values stay here, which is what makes the submit verdict trustworthy.
 */
import { auth } from "@/auth";
import { json, notFound, unauthorized } from "@/lib/api";
import { findProblem } from "@/lib/problems";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { slug } = await params;
  const found = await findProblem(slug);
  if (!found) return notFound("No such problem.");

  const raw = found.body.kind === "code" ? (found.body.tests ?? []) : [];
  const tests = (raw as {
    args?: unknown[]; stdin?: string; sample?: boolean;
  }[]).map((t, index) => ({
    index, args: t.args, stdin: t.stdin, sample: Boolean(t.sample),
  }));
  return json({ tests, total: tests.length });
}
