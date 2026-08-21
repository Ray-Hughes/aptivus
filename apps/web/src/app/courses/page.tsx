import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import {
  allProgress,
  courseStatus,
  listCourses,
  solvedProblemSlugs,
  type ProgressRow,
} from "@/lib/courses";
import { userStats } from "@/lib/stats";
import { Chip, Meter, card, hours } from "./_components/Bits";

export const metadata = {
  title: "Courses — Aptivus",
  description: "Sequenced courses: teaching, problems in order, and a checkpoint per module.",
};

export default async function CoursesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/courses");
  const userId = session.user.id;

  const [list, stats, solved, progressRows] = await Promise.all([
    listCourses(),
    userStats(userId),
    solvedProblemSlugs(userId),
    allProgress(userId),
  ]);

  // One query for every course's progress, split here rather than N queries.
  const byCourse = new Map<string, Map<string, ProgressRow>>();
  for (const row of progressRows) {
    const inner = byCourse.get(row.courseSlug) ?? new Map<string, ProgressRow>();
    inner.set(row.moduleId, row);
    byCourse.set(row.courseSlug, inner);
  }

  const cards = list.map((c) => ({
    ...c,
    status: courseStatus(c.body, byCourse.get(c.body.slug) ?? new Map(), solved),
  }));

  // The one gradient action on this page, and only when it is true: the course
  // they touched most recently that is not finished.
  const resume = cards
    .filter((c) => c.status.visited && !c.status.complete && c.status.nextModule)
    .sort((a, b) => {
      const touch = (slug: string) =>
        Math.max(0, ...[...(byCourse.get(slug)?.values() ?? [])].map((r) => r.updatedAt));
      return touch(b.body.slug) - touch(a.body.slug);
    })[0];

  const totalModules = cards.reduce((n, c) => n + c.status.moduleCount, 0);
  const doneModules = cards.reduce((n, c) => n + c.status.modulesComplete, 0);

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-6xl px-5 py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-[26px] font-semibold tracking-tight">Courses</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9aa1ad]">
              A pack is a bag of problems. A course is an opinion about the order to do them
              in, and the teaching that goes between them.
              {cards.length > 0 && (
                <>
                  {" "}
                  <span className="text-[#c8ccd4]">
                    {doneModules} of {totalModules} modules complete.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className={`${card} mt-8 p-8`}>
            <h2 className="text-[16px] font-medium text-white">No courses are loaded</h2>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-[#9aa1ad]">
              The authored courses live in <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] text-[#9ecbff]">packages/courses</code>{" "}
              and are loaded into the database by an import, which has not been run against
              this database yet.
            </p>
            <p className="mt-3 font-mono text-[12.5px] text-[#7f8794]">npm run courses:import</p>
            <Link
              href="/problems"
              className="mt-5 inline-block rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-[13.5px] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              Practice problems instead
            </Link>
          </div>
        ) : (
          <>
            {resume?.status.nextModule && (
              <section className={`${card} mt-7 flex flex-wrap items-center gap-5 p-5`}>
                <div className="min-w-[240px] flex-1">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[#7f8794]">
                    Where you left off
                  </p>
                  <p className="mt-1.5 text-[16px] font-medium text-white">
                    {resume.body.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#9aa1ad]">
                    Next: {resume.status.nextModule.title}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <Meter
                      value={resume.status.fraction}
                      className="w-full max-w-xs"
                      label={`${resume.body.title} progress`}
                    />
                    <span className="whitespace-nowrap font-mono text-[11.5px] text-[#7f8794]">
                      {resume.status.modulesComplete}/{resume.status.moduleCount}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/courses/${resume.body.slug}/${resume.status.nextModule.id}`}
                  className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                >
                  Continue →
                </Link>
              </section>
            )}

            <ul className="mt-4 grid gap-4 lg:grid-cols-2">
              {cards.map((c) => {
                const s = c.status;
                return (
                  <li key={c.body.slug} className={`${card} flex flex-col p-5 transition hover:border-white/[0.14]`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.body.level && <Chip tone="level">{c.body.level}</Chip>}
                      <Chip>{hours(c.body.estimatedHours)}</Chip>
                      <Chip>{s.moduleCount} modules</Chip>
                      <Chip>{c.row.problemCount} problems</Chip>
                    </div>

                    <h2 className="mt-3.5 text-[18px] font-semibold tracking-tight text-white">
                      <Link
                        href={`/courses/${c.body.slug}`}
                        className="outline-none ring-offset-4 ring-offset-[#0b0c0f] hover:text-[#7fc3ff] focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                      >
                        {c.body.title}
                      </Link>
                    </h2>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#c8ccd4]">
                      {c.body.subtitle}
                    </p>

                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#7f8794]">
                      <span className="text-[#9aa1ad]">Who it is for. </span>
                      {c.body.audience}
                    </p>

                    <div className="mt-auto pt-5">
                      <div className="flex items-center gap-3">
                        <Meter
                          value={s.fraction}
                          className="w-full"
                          label={`${c.body.title} progress`}
                        />
                        <span className="whitespace-nowrap font-mono text-[11.5px] text-[#7f8794]">
                          {s.modulesComplete}/{s.moduleCount}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[12.5px] text-[#7f8794]">
                          {s.complete
                            ? "Complete"
                            : s.started
                              ? `In progress · next is ${s.nextModule?.title}`
                              : "Not started"}
                        </p>
                        <Link
                          href={`/courses/${c.body.slug}`}
                          className="shrink-0 rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[13px] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                        >
                          {s.complete ? "Review" : s.started ? "Continue" : "View course"}
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-[12.5px] leading-relaxed text-[#7f8794]">
              Courses overlap on purpose. Someone with five days does the sprint; someone
              with a month does the two it compresses. The problems are shared - solving one
              anywhere marks it solved everywhere.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
