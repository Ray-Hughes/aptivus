import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { mockRoundProblems, mockRounds, problems } from "@/db/schema";
import type { Block, RoundEvent } from "@/lib/mock-scorecard";
import { elapsedOf, serverNow } from "@/lib/mock-sync";
import { RoundView, type RoundProblem } from "./RoundView";

export const metadata = { title: "Round in progress — Aptivus" };
export const dynamic = "force-dynamic";

/**
 * Every problem's prompt closes with a `### Why this one` section that names
 * the trap outright — "brokers with zero submissions disappear under an INNER
 * JOIN", "off-by-one here is the most common way to fail a round". That is
 * excellent coaching and it is unambiguously a hint, so it does not travel
 * during a round. It is back, free, the moment the scorecard loads.
 */
function withoutCoaching(prompt: string): string {
  return prompt.replace(/\n#{2,4}\s*Why this one[\s\S]*$/i, "").trimEnd();
}

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/mock/${id}`);

  const [round] = await db
    .select()
    .from(mockRounds)
    .where(eq(mockRounds.id, id))
    .limit(1);
  if (!round || round.userId !== session.user.id) notFound();
  // A round that is over has a scorecard, not an editor.
  if (round.status !== "in_progress") redirect(`/mock/${id}/scorecard`);

  const slots = await db
    .select()
    .from(mockRoundProblems)
    .where(eq(mockRoundProblems.roundId, round.id))
    .orderBy(asc(mockRoundProblems.orderIndex));

  const rows = slots.length
    ? await db.select().from(problems).where(inArray(problems.id, slots.map((s) => s.problemId)))
    : [];

  const list: RoundProblem[] = slots.map((slot) => {
    const row = rows.find((r) => r.id === slot.problemId);
    const body = (row?.body ?? {}) as Record<string, unknown>;
    const languages = (body.languages ?? {}) as Record<string, { starter?: string }>;
    const tests = (body.tests ?? []) as { sample?: boolean; args?: unknown[]; stdin?: string }[];
    const isSql = row?.kind === "sql";
    const sqlSpec = (body.sql ?? {}) as { schema?: string; seed?: string };
    return {
      index: slot.orderIndex,
      slug: row?.slug ?? "",
      title: row?.title ?? "Problem",
      // The pattern stays on the server until the scorecard. Naming it is a hint.
      difficulty: row?.difficulty ?? "medium",
      minutes: row?.minutes ?? 15,
      kind: isSql ? "sql" : "code",
      prompt: withoutCoaching(String(body.prompt ?? "")),
      starter: slot.code ?? (isSql ? (languages.sql?.starter ?? "SELECT\n") : (languages.python?.starter ?? "")),
      scratch: slot.scratch ?? "",
      func: (body.signature as { name?: Record<string, string> } | undefined)?.name?.python ?? "solve",
      sampleTests: tests.filter((t) => t.sample),
      hiddenCount: tests.filter((t) => !t.sample).length,
      sqlSchema: sqlSpec.schema ?? "",
      sqlSeed: sqlSpec.seed ?? "",
      solved: slot.solved,
      stopped: slot.stopped,
    };
  });

  const activity = round.activity ?? { blocks: [], events: [] };
  const elapsed = elapsedOf(round, serverNow());

  // Time the browser never accounted for - a reload, a closed laptop, a tab
  // that slept - is booked as idle up front rather than leaving the bar
  // showing less elapsed than the clock says.
  const traced = (activity.blocks as Block[]).reduce((n, b) => n + b.d, 0);
  const blocks: Block[] =
    traced < elapsed
      ? [...(activity.blocks as Block[]), { p: 0, a: "idle" as const, d: elapsed - traced }]
      : (activity.blocks as Block[]);

  return (
    <RoundView
      roundId={round.id}
      durationSeconds={round.durationSeconds}
      /* The clock the browser starts from is the server's, not its own. */
      elapsedAtLoad={elapsed}
      problems={list}
      /* A reload mid-round resumes the trace rather than starting a new one. */
      initialBlocks={blocks}
      initialEvents={activity.events as RoundEvent[]}
    />
  );
}
