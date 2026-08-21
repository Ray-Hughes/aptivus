import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/db";
import { companies, profiles } from "@/db/schema";
import { listAchievements } from "@/lib/achievements";
import { continueCourse } from "@/lib/courses";
import { summary } from "@/lib/entitlements";
import { userStats } from "@/lib/stats";

export const metadata = { title: "Progress — Aptivus" };

/** 40 XP a solve, 25 a clean one. Levels widen as they go. */
function levelFor(xp: number) {
  let level = 1, need = 200, spent = 0;
  while (xp - spent >= need) { spent += need; level++; need = Math.round(need * 1.25); }
  return { level, into: xp - spent, need, title: TITLES[Math.min(level - 1, TITLES.length - 1)] };
}
const TITLES = [
  "First Steps", "Warming Up", "Getting Fluent", "Pattern Spotter", "Steady Hands",
  "Edge-case Hunter", "Pattern Hunter", "Edge-case Wrangler", "Interview Ready", "Relentless",
];

const card = "rounded-2xl border border-white/[0.07] bg-white/[0.02]";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/dashboard");
  const userId = session.user.id;

  const [stats, ent, badges, profileRow, companyRows, resume] = await Promise.all([
    userStats(userId),
    summary(userId),
    listAchievements(userId),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select({ slug: companies.slug, name: companies.name }).from(companies),
    // Null unless they have actually started something. A dashboard that tells
    // you to continue a course you never opened is noise.
    continueCourse(userId),
  ]);

  const xp = stats.solved * 40 + stats.cleanSolves * 25;
  const lv = levelFor(xp);
  const pct = Math.round((lv.into / lv.need) * 100);
  const target = companyRows.find((c) => c.slug === profileRow[0]?.targetCompany);
  const earned = badges.filter((b) => b.earned);
  const initials = (session.user.name ?? session.user.email)
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  const R = 34, C = 2 * Math.PI * R;

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-6xl px-5 py-8">
        {/* identity */}
        <section className={`${card} flex flex-wrap items-center gap-6 p-6`}>
          <div className="relative grid h-[86px] w-[86px] shrink-0 place-items-center">
            <svg width="86" height="86" className="absolute -rotate-90" aria-hidden>
              <circle cx="43" cy="43" r={R} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="5" />
              <circle
                cx="43" cy="43" r={R} fill="none" stroke="url(#lvl)" strokeWidth="5"
                strokeLinecap="round" strokeDasharray={C}
                strokeDashoffset={C - (C * pct) / 100}
              />
              <defs>
                <linearGradient id="lvl" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#00E5FF" /><stop offset="100%" stopColor="#9E7BFF" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[19px] font-bold">{initials}</span>
          </div>

          <div className="min-w-[220px] flex-1">
            <h1 className="text-[24px] font-semibold tracking-tight">
              {session.user.name ?? session.user.email.split("@")[0]}
            </h1>
            <p className="mt-1 text-[13px] text-[#9aa1ad]">
              Level {lv.level} · {lv.title}
              {target ? <> · targeting <span className="text-[#4aa3ff]">{target.name}</span></> : null}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF]"
                     style={{ width: `${pct}%` }} />
              </div>
              <span className="whitespace-nowrap font-mono text-[11.5px] text-[#7f8794]">
                {lv.into}/{lv.need} XP
              </span>
            </div>
          </div>

          {/* One primary action a view. When a course is underway it is the
              course, and practice steps back to a secondary. */}
          <Link
            href="/problems"
            className={
              resume
                ? "rounded-xl border border-white/12 bg-white/[0.04] px-5 py-2.5 text-[13.5px] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                : "rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            }
          >
            {stats.solved ? "Resume practice →" : "Start practicing →"}
          </Link>
        </section>

        {/* course in progress */}
        {resume && (
          <section className={`${card} mt-4 flex flex-wrap items-center gap-6 p-5`}>
            <div className="min-w-[240px] flex-1">
              <p className="text-[12px] uppercase tracking-[0.08em] text-[#7f8794]">
                Continue your course
              </p>
              <p className="mt-1.5 text-[17px] font-medium text-white">{resume.courseTitle}</p>
              <p className="mt-0.5 text-[13px] text-[#9aa1ad]">
                Module {resume.moduleNumber} of {resume.moduleCount}: {resume.moduleTitle}
                <span className="text-[#6b727e]"> · about {resume.estimatedMinutes} minutes</span>
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF]"
                    style={{ width: `${Math.round(resume.fraction * 100)}%` }}
                  />
                </div>
                <span className="whitespace-nowrap font-mono text-[11.5px] text-[#7f8794]">
                  {resume.modulesComplete}/{resume.moduleCount} modules
                </span>
              </div>
            </div>
            <Link
              href={`/courses/${resume.courseSlug}/${resume.moduleId}`}
              className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              Continue →
            </Link>
          </section>
        )}

        {/* stat tiles */}
        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Current streak", v: stats.streak, s: stats.streak ? "days in a row" : "solve one today" },
            { l: "Problems solved", v: `${stats.solved}/${stats.total}`, s: `${stats.total - stats.solved} to go` },
            { l: "Clean solves", v: `${stats.cleanPct}%`, s: "no hint, no solution" },
            { l: "Gems", v: stats.gems, s: ent.pro ? "Pro — unlimited" : `${ent.hintsLeft} hints left today` },
          ].map((t) => (
            <div key={t.l} className={`${card} p-4`}>
              <p className="text-[12px] text-[#7f8794]">{t.l}</p>
              <p className="mt-1 text-[26px] font-semibold tabular-nums">{t.v}</p>
              <p className="mt-0.5 text-[11.5px] text-[#6b727e]">{t.s}</p>
            </div>
          ))}
        </section>

        {/* rewards */}
        <section className="mt-4">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="text-[17px] font-semibold">Rewards &amp; achievements</h2>
            <p className="text-[12px] text-[#7f8794]">
              Gems come from your first clean solve of a problem. Capped at 30 a day, so grinding easy ones cannot farm it.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className={`${card} p-5`}>
              <h3 className="text-[13px] font-medium text-[#c8ccd4]">Recent gems</h3>
              {stats.ledger.length === 0 ? (
                <p className="mt-3 text-[13px] text-[#7f8794]">
                  Nothing yet. Solve a problem without a hint to earn your first.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.ledger.map((g) => (
                    <li key={g.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate text-[#c8ccd4]">
                        {g.reason.replace(/_/g, " ")}
                      </span>
                      <span className={`shrink-0 font-mono ${g.delta > 0 ? "text-[#7fe0a2]" : "text-[#ff9d9d]"}`}>
                        {g.delta > 0 ? "+" : ""}{g.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${card} p-5`}>
              <h3 className="text-[13px] font-medium text-[#c8ccd4]">
                Streak · last 12 weeks
              </h3>
              <div className="mt-3 grid grid-flow-col grid-rows-7 gap-[3px]">
                {stats.heat.map((d) => (
                  <span
                    key={d.day}
                    title={`${d.day}${d.active ? " · solved" : ""}`}
                    className={`h-[11px] w-[11px] rounded-[2px] ${
                      d.active ? "bg-[#39c06c]" : "bg-white/[0.06]"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-[#6b727e]">
                {stats.streak > 0
                  ? `${stats.streak} day streak · +10 gems at 7`
                  : "No streak yet — one solve starts it"}
              </p>
            </div>
          </div>

          <div className={`${card} mt-4 p-5`}>
            <h3 className="text-[13px] font-medium text-[#c8ccd4]">
              Badges <span className="text-[#6b727e]">· {earned.length} of {badges.length} earned</span>
            </h3>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {badges.map((b) => (
                <li
                  key={b.slug}
                  title={b.description}
                  className={`rounded-xl border p-3 text-center ${
                    b.earned
                      ? "border-[#2f6b45] bg-[#12331f]"
                      : "border-white/[0.07] bg-white/[0.02]"
                  }`}
                >
                  <div className={`text-[20px] ${b.earned ? "" : "opacity-30 grayscale"}`}>{b.icon}</div>
                  <p className={`mt-1.5 text-[12px] ${b.earned ? "text-white" : "text-[#6b727e]"}`}>
                    {b.name}
                  </p>
                  {!b.earned && b.progress > 0 && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF]"
                           style={{ width: `${Math.round(b.progress * 100)}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* patterns + activity */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className={`${card} p-5`}>
            <h3 className="text-[13px] font-medium text-[#c8ccd4]">Patterns solved</h3>
            {stats.byPattern.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#7f8794]">Nothing solved yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {stats.byPattern.slice(0, 8).map((p) => (
                  <li key={p.pattern ?? "?"} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-[12.5px] text-[#9aa1ad]">
                      {p.pattern ?? "unclassified"}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-[#4aa3ff]"
                           style={{ width: `${Math.min(100, p.n * 25)}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right font-mono text-[11.5px] text-[#7f8794]">{p.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${card} p-5`}>
            <h3 className="text-[13px] font-medium text-[#c8ccd4]">Recent activity</h3>
            {stats.recent.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#7f8794]">
                Nothing yet. <Link href="/problems" className="text-[#4aa3ff] hover:underline">Pick a problem</Link>.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {stats.recent.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <Link href={`/practice/${a.slug}`} className="min-w-0 truncate text-[#c8ccd4] hover:text-white">
                      {a.title}
                    </Link>
                    <span className={`shrink-0 font-mono text-[11.5px] ${
                      a.status === "solved" ? "text-[#7fe0a2]" : "text-[#7f8794]"}`}>
                      {a.testsPassed}/{a.testsTotal}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
