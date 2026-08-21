import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { ProblemFilters } from "@/components/ProblemFilters";
import { db } from "@/db";
import { attempts, problems } from "@/db/schema";
import { summary } from "@/lib/entitlements";
import { userStats } from "@/lib/stats";

export const metadata = { title: "Problems — Aptivus" };

export default async function ProblemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/problems");
  const userId = session.user.id;

  const [rows, mine, stats, ent] = await Promise.all([
    db
      .select({
        id: problems.id, slug: problems.slug, title: problems.title,
        kind: problems.kind, difficulty: problems.difficulty,
        pattern: problems.pattern, minutes: problems.minutes, pack: problems.pack,
      })
      .from(problems)
      .where(eq(problems.isPublished, true))
      .orderBy(problems.slug),
    db
      .select({
        problemId: attempts.problemId,
        solved: sql<number>`max(case when ${attempts.status} = 'solved' then 1 else 0 end)`,
        tries: sql<number>`count(*)`,
      })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .groupBy(attempts.problemId),
    userStats(userId),
    summary(userId),
  ]);

  const byId = new Map(mine.map((m) => [m.problemId, m]));
  const items = rows.map((r) => {
    const m = byId.get(r.id);
    return {
      ...r,
      status: m?.solved ? "solved" : m ? "tried" : "new",
      tries: m?.tries ?? 0,
    };
  });

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-6xl px-5 py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">Problems</h1>
            <p className="mt-1 text-[13.5px] text-[#9aa1ad]">
              {stats.solved} of {items.length} solved
              {ent.pro
                ? " · Pro"
                : ` · ${ent.hintsLeft} hints and ${ent.solutionsLeft} solutions left today`}
            </p>
          </div>
          <Link
            href="/mock"
            className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-[13.5px] transition hover:bg-white/[0.09]"
          >
            Start a mock round
          </Link>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] transition-all"
            style={{ width: `${items.length ? (stats.solved / items.length) * 100 : 0}%` }}
          />
        </div>

        <ProblemFilters items={items} />
      </main>
    </div>
  );
}
