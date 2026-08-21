import { redirect } from "next/navigation";
import Image from "next/image";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { attempts, profiles, userAchievements, achievements } from "@/db/schema";
import { summary } from "@/lib/entitlements";
import { allFlagsFor } from "@/lib/flags";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/dashboard");
  const userId = session.user.id;

  const [ent, flags, solvedRows, recent, badges, profile] = await Promise.all([
    summary(userId),
    allFlagsFor(userId),
    db
      .select({ n: sql<number>`count(distinct ${attempts.problemId})` })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "solved"))),
    db.select().from(attempts).where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.createdAt)).limit(5),
    db
      .select({ name: achievements.name, icon: achievements.icon, tier: achievements.tier,
                earnedAt: userAchievements.earnedAt })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .where(eq(userAchievements.userId, userId)),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
  ]);

  const solved = solvedRows[0]?.n ?? 0;
  const initials = (session.user.name ?? session.user.email ?? "?")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  return (
    <main className="min-h-screen bg-[#0f1013] text-[#dfe1e5]">
      <header className="flex items-center justify-between border-b border-[#24262b] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="" width={26} height={26} />
          <span className="font-semibold tracking-tight">Aptivus</span>
        </div>
        <div className="flex items-center gap-4">
          {session.user.role === "admin" && (
            <a href="/admin" className="text-[13px] text-[#8b8f96] hover:text-[#dfe1e5]">Admin</a>
          )}
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#00E5FF] to-[#7C4DFF] text-[12px] font-bold text-[#0f1013]">
            {initials}
          </div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="rounded-md border border-[#33363d] px-3 py-1.5 text-[12.5px] text-[#a9adb5] transition hover:border-[#4a4f57] hover:text-[#dfe1e5]">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight">
          Welcome back{session.user.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-1 text-[14px] text-[#8b8f96]">
          {profile[0]?.targetCompany
            ? `Preparing for ${profile[0].targetCompany}.`
            : "Set a target company in settings to tailor your practice."}
        </p>

        <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Solved", value: solved },
            { label: "Gems", value: ent.gems },
            { label: "Hints left today", value: ent.pro ? "Unlimited" : ent.hintsLeft },
            { label: "Solutions left today", value: ent.pro ? "Unlimited" : ent.solutionsLeft },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#24262b] bg-[#17181c] p-4">
              <div className="text-[22px] font-semibold tabular-nums">{s.value}</div>
              <div className="mt-0.5 text-[12px] text-[#8b8f96]">{s.label}</div>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-[#24262b] bg-[#17181c] p-5">
          <h2 className="text-[15px] font-semibold">Achievements</h2>
          {badges.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#8b8f96]">
              None yet. Solve a problem without hints to earn your first.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {badges.map((b) => (
                <li key={b.name} className="rounded-full border border-[#2f6b45] bg-[#132a1d] px-3 py-1.5 text-[12.5px]">
                  <span className="mr-1.5">{b.icon}</span>{b.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-[#24262b] bg-[#17181c] p-5">
          <h2 className="text-[15px] font-semibold">Recent activity</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#8b8f96]">Nothing yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((a) => (
                <li key={a.id} className="flex justify-between text-[13px]">
                  <span>{a.problemId}</span>
                  <span className={a.status === "solved" ? "text-[#39c06c]" : "text-[#8b8f96]"}>
                    {a.testsPassed}/{a.testsTotal} · {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-[11.5px] text-[#5f646d]">
          Flags on: {Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}
        </p>
      </div>
    </main>
  );
}
