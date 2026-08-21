/**
 * Taking the browser's account of a round and reconciling it with ours.
 *
 * The browser is the only witness to *what* the learner was doing second by
 * second - it is the only thing that can see a keystroke. It is not a witness
 * to *how long*. So everything that arrives here is clamped against
 * `now - started_at`, measured on the server: a tab that was asleep for twenty
 * minutes cannot come back claiming a 12 minute round, and a tab that lies
 * cannot buy itself time it did not spend.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mockRoundProblems, mockRounds } from "@/db/schema";

export const ACTIVITY = ["read", "write", "debug", "idle"] as const;
export const EVENT_KIND = ["run", "solved", "stopped", "done", "switch"] as const;

export const SyncBody = z.object({
  blocks: z
    .array(
      z.object({
        p: z.int().min(0).max(7),
        a: z.enum(ACTIVITY),
        d: z.int().min(1).max(24 * 60 * 60),
      }),
    )
    .max(4000)
    .default([]),
  events: z
    .array(
      z.object({
        at: z.int().min(0).max(24 * 60 * 60),
        p: z.int().min(0).max(7),
        k: z.enum(EVENT_KIND),
        pass: z.int().min(0).max(999).optional(),
        total: z.int().min(0).max(999).optional(),
      }),
    )
    .max(500)
    .default([]),
  problems: z
    .array(
      z.object({
        index: z.int().min(0).max(7),
        seconds: z.int().min(0).max(24 * 60 * 60),
        code: z.string().max(50_000).optional(),
        scratch: z.string().max(50_000).optional(),
        stopped: z.boolean().optional(),
      }),
    )
    .max(8)
    .default([]),
});

export type SyncPayload = z.infer<typeof SyncBody>;

export type RoundRow = typeof mockRounds.$inferSelect;

export async function loadOwnedRound(roundId: string, userId: string): Promise<RoundRow | null> {
  const [row] = await db
    .select()
    .from(mockRounds)
    .where(and(eq(mockRounds.id, roundId), eq(mockRounds.userId, userId)))
    .limit(1);
  return row ?? null;
}

export const serverNow = () => Math.floor(Date.now() / 1000);

/** Seconds the clock has actually been running, by our clock and only ours. */
export const elapsedOf = (round: RoundRow, at = serverNow()) =>
  Math.max(0, (round.endedAt ?? at) - round.startedAt);

/**
 * Write one sync. Returns the server's elapsed so the client can re-anchor its
 * own display - the browser counts seconds for smoothness, but every ten of
 * them it is told what the time really is.
 */
export async function applySync(round: RoundRow, payload: SyncPayload, at = serverNow()) {
  const elapsed = elapsedOf(round, at);

  // Truncate the trace at the server's elapsed. Under-reporting is fine and
  // becomes idle time on the scorecard; over-reporting is simply cut off.
  const blocks: { p: number; a: string; d: number }[] = [];
  let run = 0;
  for (const b of payload.blocks) {
    if (run >= elapsed) break;
    const d = Math.min(b.d, elapsed - run);
    if (d <= 0) continue;
    blocks.push({ p: b.p, a: b.a, d });
    run += d;
  }

  const events = payload.events
    .map((e) => ({ ...e, at: Math.min(Math.max(0, e.at), elapsed) }))
    .sort((a, b) => a.at - b.at);

  await db.update(mockRounds).set({ activity: { blocks, events } }).where(eq(mockRounds.id, round.id));

  const rows = await db
    .select()
    .from(mockRoundProblems)
    .where(eq(mockRoundProblems.roundId, round.id));

  for (const p of payload.problems) {
    const row = rows.find((r) => r.orderIndex === p.index);
    if (!row) continue;
    const runs = events.filter((e) => e.p === p.index && e.k === "run");
    const stoppedNow = row.stopped || Boolean(p.stopped) || events.some((e) => e.p === p.index && e.k === "stopped");
    await db
      .update(mockRoundProblems)
      .set({
        // Per-problem time is client-witnessed and server-bounded: it can
        // never exceed the round's own elapsed.
        timeSpentMs: Math.min(p.seconds, elapsed) * 1000,
        attempts: Math.max(row.attempts, runs.length),
        firstRunAt: row.firstRunAt ?? (runs.length ? round.startedAt + runs[0].at : null),
        stopped: stoppedNow,
        ...(p.code !== undefined ? { code: p.code } : {}),
        ...(p.scratch !== undefined ? { scratch: p.scratch } : {}),
      })
      .where(eq(mockRoundProblems.id, row.id));
  }

  return { elapsed, durationSeconds: round.durationSeconds, status: round.status };
}
