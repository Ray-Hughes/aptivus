import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { spend, summary } from "@/lib/entitlements";

const Body = z.object({ level: z.number().int().min(0).max(10) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [row] = await db.select().from(problems).where(eq(problems.slug, slug)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const hints = ((row.body as { hints?: string[] }).hints ?? []);
  const level = parsed.data.level;
  if (level >= hints.length) return NextResponse.json({ error: "No more hints." }, { status: 404 });

  // Free allowance first, then gems. Never charge twice for the same reveal.
  const result = await spend(session.user.id, "hint", { problemId: row.id, level });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: `You have used today's free hints and need ${result.cost} gems. You have ${result.balance}.`,
        needGems: result.cost, balance: result.balance,
      },
      { status: 402 },
    );
  }

  const ent = await summary(session.user.id);
  return NextResponse.json({
    hint: hints[level],
    paidWith: result.paidWith,
    entitlements: {
      pro: ent.pro, gems: ent.gems,
      hintsLeft: Number.isFinite(ent.hintsLeft) ? ent.hintsLeft : -1,
      solutionsLeft: Number.isFinite(ent.solutionsLeft) ? ent.solutionsLeft : -1,
    },
  });
}
