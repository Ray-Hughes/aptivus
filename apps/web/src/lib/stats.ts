import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, gemLedger, problems, users } from "@/db/schema";

/** Everything the header and the progress page need, in one place. */
export async function userStats(userId: string) {
  const [solvedRow] = await db
    .select({ n: sql<number>`count(distinct ${attempts.problemId})` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")));

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(problems)
    .where(eq(problems.isPublished, true));

  const [gemRow] = await db
    .select({ b: users.gemBalance }).from(users).where(eq(users.id, userId)).limit(1);

  // Distinct UTC days with a solve, newest first, for the streak.
  const days = await db
    .selectDistinct({ day: sql<string>`date(${attempts.createdAt}, 'unixepoch')` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")))
    .orderBy(sql`1 desc`);

  const daySet = new Set(days.map((d) => d.day));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  let streak = 0;
  // Yesterday still counts: a streak should not break because it is 9am.
  const startsToday = daySet.has(iso(today));
  const anchor = startsToday ? 0 : 1;
  if (startsToday || daySet.has(iso(new Date(Date.now() - 86400_000)))) {
    for (let i = anchor; ; i++) {
      if (daySet.has(iso(new Date(Date.now() - i * 86400_000)))) streak++;
      else break;
    }
  }

  const byPattern = await db
    .select({ pattern: problems.pattern, n: sql<number>`count(distinct ${attempts.problemId})` })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")))
    .groupBy(problems.pattern);

  const byDifficulty = await db
    .select({ difficulty: problems.difficulty, n: sql<number>`count(distinct ${attempts.problemId})` })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")))
    .groupBy(problems.difficulty);

  const [cleanRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attempts)
    .where(and(
      eq(attempts.userId, userId), eq(attempts.status, "solved"),
      eq(attempts.solutionRevealed, false), sql`${attempts.hintLevelUsed} = 0`,
    ));

  const ledger = await db
    .select().from(gemLedger)
    .where(eq(gemLedger.userId, userId))
    .orderBy(desc(gemLedger.createdAt)).limit(8);

  const recent = await db
    .select({
      id: attempts.id, status: attempts.status, createdAt: attempts.createdAt,
      testsPassed: attempts.testsPassed, testsTotal: attempts.testsTotal,
      title: problems.title, slug: problems.slug, pattern: problems.pattern,
    })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt)).limit(8);

  const solved = solvedRow?.n ?? 0;
  return {
    solved,
    total: totalRow?.n ?? 0,
    gems: gemRow?.b ?? 0,
    streak,
    cleanSolves: cleanRow?.n ?? 0,
    cleanPct: solved ? Math.round(((cleanRow?.n ?? 0) / solved) * 100) : 0,
    byPattern, byDifficulty, ledger, recent,
    /** 12 weeks of solve days, oldest first, for the heatmap. */
    heat: Array.from({ length: 84 }, (_, i) => {
      const d = new Date(Date.now() - (83 - i) * 86400_000);
      return { day: iso(d), active: daySet.has(iso(d)) };
    }),
  };
}
