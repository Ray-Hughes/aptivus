import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements, attempts, gemLedger, problems, reveals, userAchievements, users,
} from "@/db/schema";

/**
 * Achievements are evaluated server-side from the attempt history. Nothing is
 * awarded on the client's say-so, and re-running this is safe: a badge is
 * inserted once and never re-granted.
 */
export type Progress = { slug: string; progress: number; earned: boolean };

async function stats(userId: string) {
  const [solvedRow] = await db
    .select({ n: sql<number>`count(distinct ${attempts.problemId})` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")));

  const solvedIds = await db
    .selectDistinct({ id: attempts.problemId })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")));

  const revealed = await db
    .selectDistinct({ id: reveals.problemId })
    .from(reveals)
    .where(eq(reveals.userId, userId));
  const revealedSet = new Set(revealed.map((r) => r.id));

  const cleanSolves = solvedIds.filter((s) => !revealedSet.has(s.id)).length;

  // Distinct UTC days with at least one solve, newest first, for the streak.
  const days = await db
    .selectDistinct({ day: sql<string>`date(${attempts.createdAt}, 'unixepoch')` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")))
    .orderBy(sql`1 desc`);

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days.length; i++) {
    const expect = new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10);
    if (days[i]?.day === expect) streak++;
    else break;
  }

  const patterns = await db
    .selectDistinct({ p: problems.pattern })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved")));

  const allPatterns = await db.selectDistinct({ p: problems.pattern }).from(problems);

  const [sqlSolved] = await db
    .select({ n: sql<number>`count(distinct ${attempts.problemId})` })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved"), eq(problems.kind, "sql")));
  const [sqlTotal] = await db
    .select({ n: sql<number>`count(*)` })
    .from(problems)
    .where(eq(problems.kind, "sql"));

  const [nightOwl] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attempts)
    .where(and(
      eq(attempts.userId, userId), eq(attempts.status, "solved"),
      sql`cast(strftime('%H', ${attempts.createdAt}, 'unixepoch') as integer) between 0 and 4`,
    ));

  const [fast] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(and(
      eq(attempts.userId, userId), eq(attempts.status, "solved"),
      sql`${attempts.durationMs} is not null`,
      sql`${attempts.durationMs} <= ${problems.minutes} * 60000`,
    ));

  return {
    solved: solvedRow?.n ?? 0,
    cleanSolves,
    streak,
    patternsCovered: patterns.filter((x) => x.p).length,
    patternsTotal: Math.max(1, allPatterns.filter((x) => x.p).length),
    sqlSolved: sqlSolved?.n ?? 0,
    sqlTotal: sqlTotal?.n ?? 0,
    nightOwl: nightOwl?.n ?? 0,
    fast: fast?.n ?? 0,
  };
}

/** progress is 0..1; at 1 the badge is earned. */
function evaluate(s: Awaited<ReturnType<typeof stats>>): Record<string, number> {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    "first-blood": clamp(s.solved / 1),
    "clean-sweep": clamp(s.cleanSolves / 5),
    "sql-slinger": s.sqlTotal ? clamp(s.sqlSolved / s.sqlTotal) : 0,
    "streak-7": clamp(s.streak / 7),
    "streak-30": clamp(s.streak / 30),
    "night-owl": clamp(s.nightOwl / 1),
    "speed-demon": clamp(s.fast / 1),
    "debugger": 0, // trace count is client-side today; wired when traces are logged
    "pattern-master": clamp(s.patternsCovered / s.patternsTotal),
    "interview-ready": 0, // awarded by the mock-interview flow
  };
}

export async function syncAchievements(userId: string) {
  const s = await stats(userId);
  const scores = evaluate(s);
  const defs = await db.select().from(achievements);
  const mine = await db.select().from(userAchievements).where(eq(userAchievements.userId, userId));
  const byId = new Map(mine.map((m) => [m.achievementId, m]));
  const newlyEarned: { name: string; gems: number }[] = [];

  for (const def of defs) {
    const progress = scores[def.slug] ?? 0;
    const existing = byId.get(def.id);
    const alreadyEarned = Boolean(existing?.earnedAt);
    const earnedNow = progress >= 1 && !alreadyEarned;

    if (!existing) {
      await db.insert(userAchievements).values({
        userId, achievementId: def.id, progress,
        earnedAt: progress >= 1 ? Math.floor(Date.now() / 1000) : null,
      }).onConflictDoNothing();
    } else if (!alreadyEarned) {
      await db.update(userAchievements)
        .set({ progress, earnedAt: earnedNow ? Math.floor(Date.now() / 1000) : null })
        .where(and(eq(userAchievements.userId, userId),
                   eq(userAchievements.achievementId, def.id)));
    }

    if (earnedNow || (!existing && progress >= 1)) {
      newlyEarned.push({ name: def.name, gems: def.gemReward });
      if (def.gemReward > 0) {
        await db.transaction(async (tx) => {
          await tx.insert(gemLedger).values({
            userId, delta: def.gemReward, kind: "earn",
            reason: `achievement:${def.slug}`,
          });
          await tx.update(users)
            .set({ gemBalance: sql`${users.gemBalance} + ${def.gemReward}` })
            .where(eq(users.id, userId));
        });
      }
    }
  }
  return { stats: s, newlyEarned };
}

export async function listAchievements(userId: string) {
  const rows = await db
    .select({
      slug: achievements.slug, name: achievements.name, description: achievements.description,
      icon: achievements.icon, tier: achievements.tier, gemReward: achievements.gemReward,
      progress: userAchievements.progress, earnedAt: userAchievements.earnedAt,
    })
    .from(achievements)
    .leftJoin(userAchievements, and(
      eq(userAchievements.achievementId, achievements.id),
      eq(userAchievements.userId, userId),
    ));
  return rows.map((r) => ({ ...r, progress: r.progress ?? 0, earned: Boolean(r.earnedAt) }));
}
