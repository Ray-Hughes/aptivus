import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyUsage, gemLedger, reveals, subscriptions, users } from "@/db/schema";

/** Free tier, per UTC day. */
export const FREE_HINTS_PER_DAY = 5;
export const FREE_SOLUTIONS_PER_DAY = 3;

/** Gem prices. */
export const COST = { hint: 1, solution: 3, generation: 5 } as const;

/** Gems earned for a first clean solve - no hint, no solution, ever. */
export const EARN = { easy: 2, medium: 4, hard: 6 } as const;
export const DAILY_EARN_CAP = 30;

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export async function isPro(userId: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!s) return false;
  if (s.status !== "active" && s.status !== "trialing") return false;
  if (s.currentPeriodEnd && s.currentPeriodEnd * 1000 < Date.now()) return false;
  return true;
}

async function usageRow(userId: string) {
  const day = todayUtc();
  const [row] = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.dayUtc, day)))
    .limit(1);
  if (row) return row;
  await db.insert(dailyUsage).values({ userId, dayUtc: day }).onConflictDoNothing();
  return { userId, dayUtc: day, hintsUsed: 0, solutionsUsed: 0, generationsUsed: 0 };
}

export async function getBalance(userId: string) {
  const [u] = await db.select({ b: users.gemBalance }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.b ?? 0;
}

export type SpendKind = keyof typeof COST;
export type SpendResult =
  | { ok: true; paidWith: "pro" | "free" | "gem" | "already"; remainingFree: number; balance: number }
  | { ok: false; reason: "insufficient"; remainingFree: number; balance: number; cost: number };

/**
 * Order matters: already-unlocked, then Pro, then the free daily allowance,
 * then gems. Spending someone's earned gems while they still had free hints
 * left is the kind of thing that produces chargebacks.
 */
export async function spend(
  userId: string,
  kind: SpendKind,
  opts: { problemId?: string; level?: number } = {},
): Promise<SpendResult> {
  const level = opts.level ?? 0;

  if (opts.problemId && (kind === "hint" || kind === "solution")) {
    const [already] = await db
      .select()
      .from(reveals)
      .where(
        and(
          eq(reveals.userId, userId),
          eq(reveals.problemId, opts.problemId),
          eq(reveals.kind, kind),
          eq(reveals.level, level),
        ),
      )
      .limit(1);
    if (already) {
      return { ok: true, paidWith: "already", remainingFree: -1, balance: await getBalance(userId) };
    }
  }

  const record = async (paidWith: "pro" | "free" | "gem") => {
    if (opts.problemId && (kind === "hint" || kind === "solution")) {
      await db.insert(reveals).values({ userId, problemId: opts.problemId, kind, level, paidWith })
        .onConflictDoNothing();
    }
  };

  if (await isPro(userId)) {
    await record("pro");
    return { ok: true, paidWith: "pro", remainingFree: -1, balance: await getBalance(userId) };
  }

  const usage = await usageRow(userId);
  const limits = { hint: FREE_HINTS_PER_DAY, solution: FREE_SOLUTIONS_PER_DAY, generation: 0 };
  const usedCol = { hint: "hintsUsed", solution: "solutionsUsed", generation: "generationsUsed" } as const;
  const used = usage[usedCol[kind]] as number;
  const limit = limits[kind];

  if (used < limit) {
    await db
      .update(dailyUsage)
      .set({ [usedCol[kind]]: used + 1 })
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.dayUtc, todayUtc())));
    await record("free");
    return { ok: true, paidWith: "free", remainingFree: limit - used - 1, balance: await getBalance(userId) };
  }

  const cost = COST[kind];
  const balance = await getBalance(userId);
  if (balance < cost) {
    return { ok: false, reason: "insufficient", remainingFree: 0, balance, cost };
  }

  await db.transaction(async (tx) => {
    await tx.insert(gemLedger).values({
      userId, delta: -cost, kind: "spend", reason: kind, problemId: opts.problemId,
    });
    await tx
      .update(users)
      .set({ gemBalance: sql`${users.gemBalance} - ${cost}` })
      .where(eq(users.id, userId));
  });
  await record("gem");
  return { ok: true, paidWith: "gem", remainingFree: 0, balance: balance - cost };
}

/** Awarded once per problem, and only when nothing was revealed for it. */
export async function awardCleanSolve(
  userId: string,
  problemId: string,
  difficulty: keyof typeof EARN,
) {
  const used = await db
    .select({ n: sql<number>`count(*)` })
    .from(reveals)
    .where(and(eq(reveals.userId, userId), eq(reveals.problemId, problemId)));
  if ((used[0]?.n ?? 0) > 0) return { awarded: 0, reason: "revealed" as const };

  const already = await db
    .select({ n: sql<number>`count(*)` })
    .from(gemLedger)
    .where(and(eq(gemLedger.userId, userId), eq(gemLedger.problemId, problemId), eq(gemLedger.kind, "earn")));
  if ((already[0]?.n ?? 0) > 0) return { awarded: 0, reason: "already" as const };

  const since = Math.floor(Date.now() / 1000) - 86400;
  const earnedToday = await db
    .select({ total: sql<number>`coalesce(sum(${gemLedger.delta}), 0)` })
    .from(gemLedger)
    .where(and(eq(gemLedger.userId, userId), eq(gemLedger.kind, "earn"), sql`${gemLedger.createdAt} > ${since}`));
  const headroom = DAILY_EARN_CAP - (earnedToday[0]?.total ?? 0);
  if (headroom <= 0) return { awarded: 0, reason: "daily_cap" as const };

  const amount = Math.min(EARN[difficulty], headroom);
  await db.transaction(async (tx) => {
    await tx.insert(gemLedger).values({
      userId, delta: amount, kind: "earn", reason: `clean_solve_${difficulty}`, problemId,
    });
    await tx
      .update(users)
      .set({ gemBalance: sql`${users.gemBalance} + ${amount}` })
      .where(eq(users.id, userId));
  });
  return { awarded: amount, reason: "ok" as const };
}

export async function summary(userId: string) {
  const [pro, usage, balance] = await Promise.all([
    isPro(userId), usageRow(userId), getBalance(userId),
  ]);
  return {
    pro,
    gems: balance,
    hintsLeft: pro ? Infinity : Math.max(0, FREE_HINTS_PER_DAY - usage.hintsUsed),
    solutionsLeft: pro ? Infinity : Math.max(0, FREE_SOLUTIONS_PER_DAY - usage.solutionsUsed),
    resetsAt: `${todayUtc()}T23:59:59Z`,
  };
}
