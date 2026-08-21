import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { attempts, problems } from "@/db/schema";
import { syncAchievements } from "@/lib/achievements";
import { awardCleanSolve, getBalance } from "@/lib/entitlements";

const Body = z.object({
  code: z.string().max(200_000),
  language: z.string().max(30).default("python"),
  outputs: z.array(z.object({ ok: z.boolean(), value: z.unknown().optional(), error: z.string().optional() })),
  durationMs: z.number().int().nonnegative().optional(),
});

/** Same comparison the engine uses, so browser and server agree on a pass. */
function matches(got: unknown, expected: unknown) {
  if (typeof expected === "number" && typeof got === "number") {
    return Math.abs(got - expected) < 1e-6;
  }
  try { return JSON.stringify(got) === JSON.stringify(expected); }
  catch { return false; }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [row] = await db.select().from(problems).where(eq(problems.slug, slug)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = row.body as { tests?: { expected?: unknown; sample?: boolean }[] };
  const tests = body.tests ?? [];
  const outputs = parsed.data.outputs;

  const results = tests.map((t, i) => {
    const o = outputs[i];
    const passed = Boolean(o?.ok) && matches(o?.value, t.expected);
    return {
      input: `test ${i + 1}`,
      expected: t.expected,
      got: o?.ok ? o.value : null,
      passed,
      error: o?.error ?? "",
      sample: Boolean(t.sample),
      index: i,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const solved = passed === tests.length && tests.length > 0;

  await db.insert(attempts).values({
    userId: session.user.id,
    problemId: row.id,
    language: parsed.data.language,
    status: solved ? "solved" : "tried",
    code: parsed.data.code.slice(0, 100_000),
    testsPassed: passed,
    testsTotal: tests.length,
    durationMs: parsed.data.durationMs ?? null,
  });

  let gemsAwarded = 0;
  let newlyEarned: { name: string; gems: number }[] = [];
  if (solved) {
    const diff = (["easy", "medium", "hard"] as const).includes(row.difficulty as "easy")
      ? (row.difficulty as "easy" | "medium" | "hard") : "medium";
    const award = await awardCleanSolve(session.user.id, row.id, diff);
    gemsAwarded = award.awarded;
    newlyEarned = (await syncAchievements(session.user.id)).newlyEarned;
  }

  return NextResponse.json({
    results, passed, total: tests.length, solved, gemsAwarded, newlyEarned,
    gems: await getBalance(session.user.id),
  });
}
