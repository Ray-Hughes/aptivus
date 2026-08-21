import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import {
  courseStatus,
  getCourse,
  listCourses,
  progressForCourse,
  solvedProblemSlugs,
} from "@/lib/courses";
import { userStats } from "@/lib/stats";
import { startModule } from "../_actions";
import { Chip, Meter, StateDot, card, hours, minutes } from "../_components/Bits";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const loaded = await getCourse(slug);
  if (!loaded) return { title: "Course — Aptivus" };
  return {
    title: `${loaded.body.title} — Aptivus`,
    description: loaded.body.subtitle,
  };
}

/** How the module's own completion rule reads on a list row. */
function ruleLabel(rule: string, min?: number): string {
  switch (rule) {
    case "all-required-problems":
      return "every required problem";
    case "min-problems":
      return `any ${min ?? 1} problems`;
    case "checkpoint-only":
      return "checkpoint only";
    default:
      return "self-attested";
  }
}

export default async function CoursePage({ params }: Params) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/signin?next=/courses/${slug}`);
  const userId = session.user.id;

  const loaded = await getCourse(slug);
  if (!loaded) notFound();
  const course = loaded.body;

  const [stats, solved, progress, all] = await Promise.all([
    userStats(userId),
    solvedProblemSlugs(userId),
    progressForCourse(userId, course.slug),
    // Only needed to turn prerequisite slugs into titles, and only when there
    // are any.
    course.prerequisiteCourses?.length ? listCourses() : Promise.resolve([]),
  ]);

  const status = courseStatus(course, progress, solved);
  const prereqCourses = (course.prerequisiteCourses ?? [])
    .map((s) => all.find((c) => c.body.slug === s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const next = status.nextModule;
  const nextIndex = next ? course.modules.findIndex((m) => m.id === next.id) : -1;

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-6xl px-5 py-9">
        <nav aria-label="Breadcrumb" className="text-[12.5px] text-[#7f8794]">
          <Link
            href="/courses"
            className="rounded outline-none ring-offset-2 ring-offset-[#0b0c0f] hover:text-[#c8ccd4] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
          >
            Courses
          </Link>
          <span aria-hidden className="px-1.5">/</span>
          <span className="text-[#9aa1ad]">{course.title}</span>
        </nav>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              {course.level && <Chip tone="level">{course.level}</Chip>}
              <Chip>{hours(course.estimatedHours)}</Chip>
              <Chip>{course.modules.length} modules</Chip>
              <Chip>{loaded.row.problemCount} problems</Chip>
            </div>
            <h1 className="mt-3.5 text-[30px] font-semibold leading-tight tracking-tight text-white">
              {course.title}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#c8ccd4]">{course.subtitle}</p>
          </div>

          <div className="w-full max-w-[300px]">
            <div className="flex items-center gap-3">
              <Meter value={status.fraction} className="w-full" label="Course progress" />
              <span className="whitespace-nowrap font-mono text-[11.5px] text-[#7f8794]">
                {status.modulesComplete}/{status.moduleCount}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] text-[#7f8794]">
              {status.complete
                ? "Every module complete."
                : status.started
                  ? `${status.modulesComplete} of ${status.moduleCount} modules complete.`
                  : "Not started."}
            </p>

            {next && (
              // The one gradient action on this page. "Start" and "continue"
              // are the same button because they are the same thing: the first
              // module that is not finished.
              <form action={startModule} className="mt-3.5">
                <input type="hidden" name="courseSlug" value={course.slug} />
                <input type="hidden" name="moduleId" value={next.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                >
                  {status.started
                    ? `Continue: ${nextIndex + 1}. ${next.title}`
                    : "Start the course →"}
                </button>
              </form>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* modules */}
          <section aria-labelledby="modules-heading">
            <h2 id="modules-heading" className="text-[17px] font-semibold">
              Modules
            </h2>
            <p className="mt-1 text-[12.5px] text-[#7f8794]">
              In order. Nothing is locked - if you need window functions on Friday, go
              straight there.
            </p>

            <ol className="mt-4 space-y-3">
              {course.modules.map((m, i) => {
                const s = status.statuses.get(m.id);
                const required = m.problems.filter((p) => !p.optional).length;
                return (
                  <li key={m.id} className={`${card} p-4 transition hover:border-white/[0.14]`}>
                    <div className="flex items-start gap-3.5">
                      <StateDot state={s?.state ?? "not-started"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="font-mono text-[12px] text-[#7f8794]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <h3 className="text-[15.5px] font-medium text-white">
                            <Link
                              href={`/courses/${course.slug}/${m.id}`}
                              className="rounded outline-none ring-offset-4 ring-offset-[#0b0c0f] hover:text-[#7fc3ff] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                            >
                              {m.title}
                            </Link>
                          </h3>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#9aa1ad]">
                          {m.summary}
                        </p>
                        <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[#7f8794]">
                          <span>{minutes(m.estimatedMinutes)}</span>
                          <span aria-hidden>·</span>
                          <span>
                            {m.problems.length === 0
                              ? "no problems"
                              : `${m.problems.length} problem${m.problems.length === 1 ? "" : "s"}${
                                  required !== m.problems.length ? ` (${required} required)` : ""
                                }`}
                          </span>
                          <span aria-hidden>·</span>
                          <span>
                            {m.checkpoint.questions.length} checkpoint question
                            {m.checkpoint.questions.length === 1 ? "" : "s"}
                          </span>
                          <span aria-hidden>·</span>
                          <span>
                            done at {ruleLabel(m.completion.rule, m.completion.minProblemsSolved)}
                          </span>
                        </p>
                      </div>
                      {s && s.state !== "not-started" && (
                        <span className="hidden w-24 shrink-0 sm:block">
                          <Meter value={s.fraction} label={`${m.title} progress`} />
                          <span className="mt-1.5 block text-right font-mono text-[11px] text-[#7f8794]">
                            {Math.round(s.fraction * 100)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* about */}
          <aside className="space-y-4">
            <section className={`${card} p-5`}>
              <h2 className="text-[13px] font-medium text-[#c8ccd4]">Who it is for</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[#9aa1ad]">{course.audience}</p>
            </section>

            <section className={`${card} p-5`}>
              <h2 className="text-[13px] font-medium text-[#c8ccd4]">Prerequisites</h2>
              {course.prerequisites.length === 0 && prereqCourses.length === 0 ? (
                <p className="mt-2 text-[13px] text-[#7f8794]">None. Start here.</p>
              ) : (
                <>
                  {prereqCourses.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {prereqCourses.map((c) => (
                        <li key={c.body.slug} className="text-[13px]">
                          <Link
                            href={`/courses/${c.body.slug}`}
                            className="rounded text-[#7fc3ff] outline-none ring-offset-2 ring-offset-[#0b0c0f] hover:underline focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                          >
                            {c.body.title}
                          </Link>
                          <span className="text-[#7f8794]"> — do this first</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {course.prerequisites.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#9aa1ad] marker:text-[#4a5058]">
                      {course.prerequisites.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <section className={`${card} p-5`}>
              <h2 className="text-[13px] font-medium text-[#c8ccd4]">
                What you will be able to do
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#9aa1ad] marker:text-[#4a5058]">
                {course.outcomes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>

            {course.timeNote && (
              <section className={`${card} p-5`}>
                <h2 className="text-[13px] font-medium text-[#c8ccd4]">About the estimate</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#9aa1ad]">
                  {course.timeNote}
                </p>
              </section>
            )}

            {course.tags && course.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {course.tags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
