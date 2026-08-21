import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { mockRoundProblems, mockRounds } from "@/db/schema";
import { AppHeader } from "@/components/AppHeader";
import { listSources } from "@/lib/mock";
import { userStats } from "@/lib/stats";
import { PreRound } from "./PreRound";

export const metadata = { title: "Mock Interview — Aptivus" };

export default async function MockPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/mock");
  const userId = session.user.id;

  const [stats, sources] = await Promise.all([userStats(userId), listSources()]);

  const [open] = await db
    .select({ id: mockRounds.id })
    .from(mockRounds)
    .where(and(eq(mockRounds.userId, userId), eq(mockRounds.status, "in_progress")))
    .limit(1);

  const [last] = await db
    .select({
      id: mockRounds.id, startedAt: mockRounds.startedAt, endedAt: mockRounds.endedAt,
      durationSeconds: mockRounds.durationSeconds,
    })
    .from(mockRounds)
    .where(and(eq(mockRounds.userId, userId), eq(mockRounds.status, "ended")))
    .orderBy(desc(mockRounds.startedAt))
    .limit(1);

  const lastSlots = last
    ? await db
        .select({ solved: mockRoundProblems.solved })
        .from(mockRoundProblems)
        .where(eq(mockRoundProblems.roundId, last.id))
    : [];

  const [counted] = await db
    .select({ n: sql<number>`count(*)` })
    .from(mockRounds)
    .where(and(eq(mockRounds.userId, userId), eq(mockRounds.status, "ended")));
  const roundsRun = counted?.n ?? 0;

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      {open && (
        <div className="border-b border-[#4a3a1a] bg-[#251c0d]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 text-[13px] text-[#e6b455]">
            <span>A round of yours is still running. The clock has not stopped.</span>
            <Link
              href={`/mock/${open.id}`}
              className="rounded-lg border border-[#6a5320] px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/[0.06]"
            >
              Go back to it
            </Link>
          </div>
        </div>
      )}

      <PreRound
        sources={sources}
        roundsRun={roundsRun}
        last={
          last && last.endedAt
            ? {
                id: last.id,
                when: new Date(last.startedAt * 1000).toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short",
                }),
                elapsed: last.endedAt - last.startedAt,
                solved: lastSlots.filter((s) => s.solved).length,
                of: lastSlots.length,
              }
            : null
        }
      />
    </div>
  );
}
