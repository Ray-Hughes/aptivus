/**
 * POST /api/problems/[slug]/submit - record an attempt, and pay for a clean
 * solve.
 *
 * Code runs in the learner's browser, so the outputs arrive from the client.
 * Three things are therefore taken from the server and never from the request:
 *
 *   - **how many tests there are**, so "I passed 999 of 1" is not expressible.
 *   - **what each test should return.** The client sends the VALUE its code
 *     produced, not a verdict, and the server compares it against expected
 *     values it never disclosed. A client that simply claims success has to
 *     produce the right answers to be believed - which is solving the problem.
 *   - **whether anything was revealed.** A clean solve means no hint and no
 *     solution was ever unlocked for this problem, and that lives in `reveals`,
 *     which only `spend()` writes.
 *
 * `awardCleanSolve` enforces the rest: first solve only, once per problem, and
 * a daily cap so the loop cannot be farmed.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { attempts, mockRoundProblems, mockRounds, reveals } from "@/db/schema";
import { isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { awardCleanSolve, summary } from "@/lib/entitlements";
import { gradeSql } from "@/lib/sql-grade";
import { findProblem, languagesOf, testCount } from "@/lib/problems";

/** Engine-identical comparison, so the browser and the server agree on a pass. */
function matches(got: unknown, want: unknown, unordered?: boolean): boolean {
  if (unordered && Array.isArray(got) && Array.isArray(want)) {
    const key = (v: unknown) => JSON.stringify(v);
    return (
      got.length === want.length &&
      got.map(key).sort().join("\u0000") === want.map(key).sort().join("\u0000")
    );
  }
  if (typeof want === "number" && typeof got === "number") {
    return Math.abs(got - want) < 1e-6;
  }
  try {
    return JSON.stringify(got ?? null) === JSON.stringify(want ?? null);
  } catch {
    return false;
  }
}

const Body = z.object({
  language: z.enum(["python", "javascript", "ruby", "sql"]),
  /** The learner's code, kept so the dashboard can show what they wrote. */
  code: z.string().max(50_000).optional(),
  /** SQL answers come back as rows; the reference query is run server-side. */
  sqlRows: z.object({
    columns: z.array(z.string()).max(64).default([]),
    rows: z.array(z.array(z.unknown()).max(64)).max(5000).default([]),
  }).optional(),
  /** One entry per test that ran: the value produced, never a verdict. */
  outputs: z
    .array(
      z.object({
        index: z.int().nonnegative(),
        ok: z.boolean(),
        value: z.unknown().optional(),
        error: z.string().max(2000).optional(),
      }),
    )
    .max(500)
    .default([]),
  durationMs: z.int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  /** Set when the submission came from inside a mock round. */
  roundId: z.string().trim().min(1).max(64).optional(),
});

/**
 * Record a graded verdict against a mock round.
 *
 * Deliberately the only writer of `solved` on a round: the client says what
 * its code produced, this file decides whether that was right, and the round
 * row learns it from here. `solved_at` is the server's clock, so a scorecard
 * cannot be given a better finishing time than the one that happened.
 */
async function recordAgainstRound(opts: {
  roundId: string; userId: string; problemId: string;
  solved: boolean; passed: number; total: number;
}) {
  const [round] = await db
    .select({ id: mockRounds.id, startedAt: mockRounds.startedAt, status: mockRounds.status })
    .from(mockRounds)
    .where(and(eq(mockRounds.id, opts.roundId), eq(mockRounds.userId, opts.userId)))
    .limit(1);
  if (!round || round.status !== "in_progress") return;

  const [slot] = await db
    .select()
    .from(mockRoundProblems)
    .where(and(eq(mockRoundProblems.roundId, round.id), eq(mockRoundProblems.problemId, opts.problemId)))
    .limit(1);
  if (!slot) return;

  const at = Math.floor(Date.now() / 1000);
  const better = (slot.checksPassed ?? -1) < opts.passed;
  await db
    .update(mockRoundProblems)
    .set({
      solved: slot.solved || opts.solved,
      solvedAt: slot.solvedAt ?? (opts.solved ? at : null),
      firstRunAt: slot.firstRunAt ?? at,
      attempts: slot.attempts + 1,
      ...(better ? { checksPassed: opts.passed, checksTotal: opts.total } : {}),
    })
    .where(eq(mockRoundProblems.id, slot.id));
}

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

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const available = languagesOf(found.body);
  if (!available.includes(body.language)) {
    return json(
      { error: `This problem has no ${body.language} version.`, languages: available },
      400,
    );
  }

  const total = testCount(found.body);
  // SQL problems are graded reference-relative and carry no per-case expected
  // values, so only code problems are value-checked here.
  // Bind the narrowed body to a variable: a boolean flag does not narrow a
  // discriminated union for the compiler.
  const codeBody = found.body.kind === "code" ? found.body : null;
  const expected = (codeBody?.tests ?? []) as {
    expected?: unknown; unordered?: boolean; sample?: boolean;
  }[];
  const unorderedProblem = Boolean(codeBody?.unordered);

  // Grade here, against values the client was never given. Distinct in-range
  // indices only, so the same test cannot be submitted twenty times.
  // SQL is graded as one answer against the reference query, not per case.
  if (!codeBody) {
    const sqlSpec = found.body.kind === "sql" ? found.body.sql : null;
    const reference = languagesOf(found.body).includes("sql")
      ? (found.body.languages as Record<string, { solution?: string }>).sql?.solution ?? ""
      : "";
    if (!sqlSpec || !reference || !body.sqlRows) {
      return json({ error: "Send the rows your query returned." }, 400);
    }
    const verdict = await gradeSql(
      { schema: sqlSpec.schema, seed: sqlSpec.seed, solution: reference,
        ordered: Boolean(sqlSpec.ordered) },
      body.sqlRows,
    );
    const [attempt] = await db.insert(attempts).values({
      userId, problemId: found.row.id, language: "sql",
      status: verdict.passed ? "solved" : "tried",
      code: body.code ?? null,
      testsPassed: verdict.passed ? 1 : 0, testsTotal: 1,
      durationMs: body.durationMs ?? null,
    }).returning({ id: attempts.id });
    const award = verdict.passed
      ? await awardCleanSolve(userId, found.row.id, found.body.difficulty)
      : { awarded: 0, reason: "not_solved" as const };
    if (body.roundId) {
      await recordAgainstRound({
        roundId: body.roundId, userId, problemId: found.row.id,
        solved: verdict.passed, passed: verdict.passed ? 1 : 0, total: 1,
      });
    }
    return json({
      attemptId: attempt.id,
      status: verdict.passed ? "solved" : "tried",
      testsPassed: verdict.passed ? 1 : 0, testsTotal: 1,
      sqlMessage: verdict.message, expectedRows: verdict.expectedRows,
      results: [{ index: 0, passed: verdict.passed, sample: false }],
      gems: { awarded: award.awarded, reason: award.reason },
      entitlements: await summary(userId),
    });
  }

  const seen = new Set<number>();
  const passedIndices = new Set<number>();
  for (const o of body.outputs) {
    if (o.index >= total || seen.has(o.index)) continue;
    seen.add(o.index);
    if (!o.ok) continue;
    if (!codeBody) { passedIndices.add(o.index); continue; }
    const want = expected[o.index]?.expected;
    if (matches(o.value, want, expected[o.index]?.unordered || unorderedProblem)) {
      passedIndices.add(o.index);
    }
  }
  const testsPassed = passedIndices.size;
  const solved = testsPassed === total && total > 0;

  const revealed = await db
    .select({ kind: reveals.kind, level: reveals.level })
    .from(reveals)
    .where(and(eq(reveals.userId, userId), eq(reveals.problemId, found.row.id)));
  const hintLevelUsed = revealed
    .filter((r) => r.kind === "hint")
    .reduce((n, r) => Math.max(n, r.level + 1), 0);
  const solutionRevealed = revealed.some((r) => r.kind === "solution");

  const [attempt] = await db
    .insert(attempts)
    .values({
      userId,
      problemId: found.row.id,
      language: body.language,
      status: solved ? "solved" : "tried",
      code: body.code ?? null,
      testsPassed,
      testsTotal: total,
      hintLevelUsed,
      solutionRevealed,
      durationMs: body.durationMs ?? null,
    })
    .returning({ id: attempts.id });

  const award = solved
    ? await awardCleanSolve(userId, found.row.id, found.body.difficulty)
    : { awarded: 0, reason: "not_solved" as const };

  if (body.roundId) {
    await recordAgainstRound({
      roundId: body.roundId, userId, problemId: found.row.id,
      solved, passed: testsPassed, total,
    });
  }

  const [{ solves = 0 } = { solves: 0 }] = await db
    .select({ solves: sql<number>`count(*)` })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.problemId, found.row.id),
        eq(attempts.status, "solved"),
      ),
    );

  return json({
    attemptId: attempt.id,
    status: solved ? "solved" : "tried",
    testsPassed,
    testsTotal: total,
    /** Per-test verdicts, decided here. */
    results: Array.from({ length: total }, (_, i) => ({
      index: i,
      passed: passedIndices.has(i),
      sample: Boolean(expected[i]?.sample),
    })),
    hintLevelUsed,
    solutionRevealed,
    firstSolve: solved && solves === 1,
    gems: { awarded: award.awarded, reason: award.reason },
    entitlements: await summary(userId),
  });
}
