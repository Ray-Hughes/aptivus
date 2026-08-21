import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { problems } from "@/db/schema";

/**
 * Test INPUTS only - never the expected outputs.
 *
 * User code runs in the browser, so the inputs have to go there. Keeping the
 * expected values server-side means a client cannot fake a pass without
 * actually computing the right answers, which is the same thing as solving it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { slug } = await params;
  const [row] = await db.select().from(problems).where(eq(problems.slug, slug)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = row.body as { tests?: { args?: unknown[]; stdin?: string; sample?: boolean }[] };
  const tests = (body.tests ?? []).map((t) => ({
    args: t.args, stdin: t.stdin, sample: Boolean(t.sample),
  }));
  return NextResponse.json({ tests });
}
