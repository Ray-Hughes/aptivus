import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { Markdown } from "@/components/Markdown";
import {
  courseStatus,
  getCourse,
  moduleStatus,
  problemMeta,
  progressForCourse,
  solvedProblemSlugs,
} from "@/lib/courses";
import { userStats } from "@/lib/stats";
import {
  attestModule,
  completeModule,
  reopenModule,
  retakeCheckpoint,
  toggleProblem,
} from "../../_actions";
import { ActionButton } from "../../_components/ActionButton";
import { Chip, Meter, StateDot, card, minutes } from "../../_components/Bits";
import { CheckpointForm, type ClientQuestion } from "../../_components/CheckpointForm";

type Params = { params: Promise<{ slug: string; module: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug, module: moduleId } = await params;
  const loaded = await getCourse(slug);
  const m = loaded?.body.modules.find((x) => x.id === moduleId);
  if (!loaded || !m) return { title: "Module — Aptivus" };
  return { title: `${m.title} — ${loaded.body.title}`, description: m.summary };
}

const DIFF: Record<string, string> = {
  easy: "text-[#7fe0a2]", medium: "text-[#e6b455]", hard: "text-[#ff9d9d]",
};

export default async function ModulePage({ params }: Params) {
  const { slug, module: moduleId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/signin?next=/courses/${slug}/${moduleId}`);
  const userId = session.user.id;

  const loaded = await getCourse(slug);
  if (!loaded) notFound();
  const course = loaded.body;

  const index = course.modules.findIndex((m) => m.id === moduleId);
  if (index === -1) notFound();
  const mod = course.modules[index];

  const [stats, solved, progressMap] = await Promise.all([
    userStats(userId),
    solvedProblemSlugs(userId),
    progressForCourse(userId, course.slug),
  ]);

  const progress = progressMap.get(mod.id);
  const status = moduleStatus(mod, progress, solved);
  const overall = courseStatus(course, progressMap, solved);
  const meta = await problemMeta(mod.problems.map((p) => p.slug));

  const marked = new Set(progress?.markedProblems ?? []);
  const answers = progress?.checkpointAnswers ?? null;
  const attempted = answers !== null && progress?.checkpointScore !== null;

  const prev = index > 0 ? course.modules[index - 1] : null;
  const nextModule = index + 1 < course.modules.length ? course.modules[index + 1] : null;

  // Only what the browser needs to ask the question. No answer key, no
  // explanations - those are rendered server-side once the attempt is in.
  const clientQuestions: ClientQuestion[] = mod.checkpoint.questions.map((q) => ({
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    options: q.kind === "choice" ? q.options : undefined,
    modelAnswer: q.kind === "choice" ? undefined : q.modelAnswer,
  }));

  const target = { courseSlug: course.slug, moduleId: mod.id };

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-3xl px-5 py-9">
        <nav aria-label="Breadcrumb" className="text-[12.5px] text-[#7f8794]">
          <Link
            href="/courses"
            className="rounded outline-none ring-offset-2 ring-offset-[#0b0c0f] hover:text-[#c8ccd4] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
          >
            Courses
          </Link>
          <span aria-hidden className="px-1.5">/</span>
          <Link
            href={`/courses/${course.slug}`}
            className="rounded outline-none ring-offset-2 ring-offset-[#0b0c0f] hover:text-[#c8ccd4] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
          >
            {course.title}
          </Link>
          <span aria-hidden className="px-1.5">/</span>
          <span className="text-[#9aa1ad]">Module {index + 1}</span>
        </nav>

        {/* header ---------------------------------------------------- */}
        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StateDot state={status.state} />
            <span className="font-mono text-[12px] text-[#7f8794]">
              {String(index + 1).padStart(2, "0")} / {String(course.modules.length).padStart(2, "0")}
            </span>
            <Chip>{minutes(mod.estimatedMinutes)}</Chip>
            {status.state === "complete" && (
              <span className="rounded-full border border-[#2f6b45] bg-[#12331f] px-2.5 py-1 text-[11.5px] text-[#7fe0a2]">
                Complete
              </span>
            )}
          </div>

          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight text-white">
            {mod.title}
          </h1>
          <p className="mt-2.5 max-w-[68ch] text-[15.5px] leading-relaxed text-[#c8ccd4]">
            {mod.summary}
          </p>

          {mod.objectives && mod.objectives.length > 0 && (
            <div className={`${card} mt-5 p-5`}>
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#7f8794]">
                What this module gets you
              </h2>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-[#c8ccd4] marker:text-[#4a5058]">
                {mod.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </header>

        {/* teaching -------------------------------------------------- */}
        <article className="mt-9">
          <Markdown source={mod.teaching} variant="prose" className="max-w-[70ch]" />
        </article>

        {/* problems -------------------------------------------------- */}
        <section aria-labelledby="problems-heading" className="mt-12">
          <h2 id="problems-heading" className="text-[19px] font-semibold tracking-tight">
            Problems
          </h2>
          {mod.problems.length === 0 ? (
            <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-[#9aa1ad]">
              None in this mod. The work here is reading, drawing and saying it out loud -
              which is why the checkpoint is the whole bar.
            </p>
          ) : (
            <>
              <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-[#9aa1ad]">
                In order - the order is the curriculum. Solved state comes from your attempts,
                so a problem you solved anywhere on Aptivus already counts here.
              </p>
              <ul className="mt-4 space-y-2.5">
                {mod.problems.map((ref) => {
                  const p = meta.get(ref.slug);
                  const isSolved = solved.has(ref.slug);
                  const isMarked = marked.has(ref.slug);
                  return (
                    <li key={ref.slug} className={`${card} p-4`}>
                      <div className="flex items-start gap-3.5">
                        <StateDot
                          state={isSolved || isMarked ? "complete" : "not-started"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            {p ? (
                              <h3 className="text-[15px] font-medium text-white">
                                <Link
                                  href={`/practice/${ref.slug}`}
                                  className="rounded outline-none ring-offset-4 ring-offset-[#0b0c0f] hover:text-[#7fc3ff] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                                >
                                  {p.title}
                                </Link>
                              </h3>
                            ) : (
                              <h3 className="text-[15px] font-medium text-[#9aa1ad]">
                                {ref.plannedSpec?.title ?? ref.slug}
                              </h3>
                            )}
                            {ref.optional && <Chip>optional</Chip>}
                            {!p && <Chip>not written yet</Chip>}
                          </div>

                          {ref.note && (
                            <p className="mt-1.5 text-[13px] leading-relaxed text-[#9aa1ad]">
                              {ref.note}
                            </p>
                          )}
                          {!p && ref.plannedSpec?.brief && (
                            <p className="mt-1.5 text-[13px] leading-relaxed text-[#7f8794]">
                              {ref.plannedSpec.brief}
                            </p>
                          )}

                          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[#7f8794]">
                            {p && (
                              <>
                                <span className={DIFF[p.difficulty] ?? ""}>{p.difficulty}</span>
                                <span aria-hidden>·</span>
                                <span>{p.kind === "sql" ? "SQL" : "Code"}</span>
                                <span aria-hidden>·</span>
                                <span>{p.minutes}m target</span>
                                {p.pattern && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>{p.pattern}</span>
                                  </>
                                )}
                              </>
                            )}
                            {isSolved && (
                              <>
                                {p && <span aria-hidden>·</span>}
                                <span className="text-[#7fe0a2]">solved</span>
                              </>
                            )}
                            {!isSolved && isMarked && (
                              <>
                                {p && <span aria-hidden>·</span>}
                                <span className="text-[#e6b455]">ticked off by you</span>
                              </>
                            )}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {isSolved ? (
                            <span className="block rounded-lg border border-[#2f6b45] bg-[#12331f] px-3 py-1.5 text-[12.5px] text-[#7fe0a2]">
                              Solved
                            </span>
                          ) : (
                            <ActionButton
                              action={toggleProblem}
                              fields={{ ...target, problemSlug: ref.slug, done: String(!isMarked) }}
                              variant={isMarked ? "ghost" : "quiet"}
                              title={
                                isMarked
                                  ? "Remove your tick"
                                  : "For work you did off the platform. A tick is not a graded solve."
                              }
                              className="text-right"
                            >
                              {isMarked ? "Untick" : "Tick off"}
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* checkpoint ------------------------------------------------ */}
        <section aria-labelledby="checkpoint-heading" className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="checkpoint-heading" className="text-[19px] font-semibold tracking-tight">
              {mod.checkpoint.title}
            </h2>
            {attempted && (
              <span
                className={`rounded-full border px-3 py-1 text-[12.5px] ${
                  status.checkpointPassed
                    ? "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]"
                    : "border-[#4a3a1a] bg-[#251c0d] text-[#e6b455]"
                }`}
              >
                {Math.round((status.checkpointScore ?? 0) * 100)}% ·{" "}
                {status.checkpointPassed ? "passed" : `${Math.round(status.passScore * 100)}% to pass`}
              </span>
            )}
          </div>

          {mod.checkpoint.intro && (
            <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-[#9aa1ad]">
              {mod.checkpoint.intro}
            </p>
          )}

          {!attempted ? (
            <>
              <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-[#9aa1ad]">
                Multiple choice is marked for you. The rest is marked by you, honestly -
                reading a template and reproducing it from memory are unrelated skills, and
                only one of them is what an interview tests.
              </p>
              <CheckpointForm
                courseSlug={course.slug}
                moduleId={mod.id}
                questions={clientQuestions}
                passScore={status.passScore}
              />
            </>
          ) : (
            <>
              <ol className="mt-5 space-y-4">
                {mod.checkpoint.questions.map((q, i) => {
                  const result = answers?.[q.id];
                  const right = result?.correct === true;
                  return (
                    <li key={q.id} className={`${card} p-4`}>
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-mono text-[12px] text-[#7f8794]">Q{i + 1}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            right
                              ? "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]"
                              : "border-[#5b2b2b] bg-[#2a1414] text-[#ff9d9d]"
                          }`}
                        >
                          {right ? "correct" : "not yet"}
                        </span>
                        {q.kind !== "choice" && (
                          <span className="text-[11px] text-[#7f8794]">self-marked</span>
                        )}
                      </div>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-[#e6e8ec]">
                        {q.prompt}
                      </p>

                      {q.kind === "choice" && q.options && (
                        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#c8ccd4]">
                          <span className="text-[#7f8794]">Answer: </span>
                          {q.options[q.answer ?? 0]}
                        </p>
                      )}
                      {q.explanation && (
                        <p className="mt-2 text-[13.5px] leading-relaxed text-[#9aa1ad]">
                          {q.explanation}
                        </p>
                      )}
                      {q.modelAnswer && (
                        <details className="mt-2.5">
                          <summary className="cursor-pointer rounded text-[13px] text-[#7fc3ff] outline-none ring-offset-2 ring-offset-[#0b0c0f] hover:text-white focus-visible:ring-2 focus-visible:ring-[#4aa3ff]">
                            Model answer
                          </summary>
                          <p className="mt-2 text-[13.5px] leading-relaxed text-[#c8ccd4]">
                            {q.modelAnswer}
                          </p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4">
                <ActionButton action={retakeCheckpoint} fields={target} variant="ghost">
                  Retake the checkpoint
                </ActionButton>
              </div>
            </>
          )}
        </section>

        {/* recap ----------------------------------------------------- */}
        {mod.recap && (
          <section aria-labelledby="recap-heading" className={`${card} mt-8 p-6`}>
            <h2 id="recap-heading" className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#7f8794]">
              Carry this into the next module
            </h2>
            <Markdown source={mod.recap} variant="prose" className="mt-1 max-w-[68ch]" />
          </section>
        )}

        {/* completion ------------------------------------------------ */}
        <section aria-labelledby="completion-heading" className={`${card} mt-8 p-6`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="completion-heading" className="text-[17px] font-semibold">
              {status.state === "complete" ? "Module complete" : "What counts as done here"}
            </h2>
            <span className="font-mono text-[11.5px] text-[#7f8794]">
              {Math.round(status.fraction * 100)}%
            </span>
          </div>
          <Meter value={status.fraction} className="mt-3" label="Module progress" />

          <ul className="mt-4 space-y-2.5">
            {status.criteria.map((c) => (
              <li key={c.key} className="flex items-start gap-3 text-[14px]">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                    c.met
                      ? "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]"
                      : "border-white/12 text-[#7f8794]"
                  }`}
                >
                  {c.met ? "✓" : "○"}
                </span>
                <span className={c.met ? "text-[#c8ccd4]" : "text-[#9aa1ad]"}>
                  {c.label}
                  <span className="text-[#7f8794]"> — {c.detail}</span>
                  <span className="sr-only">{c.met ? " (done)" : " (not done)"}</span>
                </span>
              </li>
            ))}
          </ul>

          {mod.completion.notes && (
            <p className="mt-3.5 max-w-[68ch] text-[13px] leading-relaxed text-[#7f8794]">
              {mod.completion.notes}
            </p>
          )}

          {mod.completion.rule === "self-attested" && status.state !== "complete" && (
            <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-[#9aa1ad]">
                Nothing here can be graded by a machine - drawing a diagram from memory,
                running a mock out loud, playing back a recording. Say whether you did it and
                the app will take you at your word.
              </p>
              <div className="mt-3.5">
                <ActionButton
                  action={attestModule}
                  fields={{ ...target, attested: String(!status.attested) }}
                  variant="ghost"
                >
                  {status.attested ? "Withdraw that" : "I did the work"}
                </ActionButton>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {status.state === "complete" ? (
              <>
                <ActionButton action={reopenModule} fields={target} variant="ghost">
                  Reopen this module
                </ActionButton>
                {nextModule && (
                  <Link
                    href={`/courses/${course.slug}/${nextModule.id}`}
                    className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
                  >
                    Next: {nextModule.title} →
                  </Link>
                )}
                {!nextModule && overall.complete && (
                  <p className="text-[13.5px] text-[#7fe0a2]">
                    That is the whole course. Every module complete.
                  </p>
                )}
              </>
            ) : status.meetsCriteria ? (
              <ActionButton
                action={completeModule}
                fields={target}
                variant="primary"
                pendingLabel="Saving…"
                className="[&>button]:rounded-xl [&>button]:px-5 [&>button]:py-2.5"
              >
                Mark this module complete
              </ActionButton>
            ) : (
              <p className="text-[13px] text-[#7f8794]">
                Finish the unticked items above, then mark it complete here.
              </p>
            )}
          </div>
        </section>

        {/* module nav ------------------------------------------------ */}
        <nav
          aria-label="Modules"
          className="mt-10 flex flex-wrap items-stretch justify-between gap-3 border-t border-white/[0.07] pt-6"
        >
          {prev ? (
            <Link
              href={`/courses/${course.slug}/${prev.id}`}
              className="max-w-[46%] rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              <span className="block text-[11.5px] text-[#7f8794]">← Previous</span>
              <span className="mt-0.5 block text-[13.5px] text-[#c8ccd4]">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextModule ? (
            <Link
              href={`/courses/${course.slug}/${nextModule.id}`}
              className="max-w-[46%] rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-right outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              <span className="block text-[11.5px] text-[#7f8794]">Next →</span>
              <span className="mt-0.5 block text-[13.5px] text-[#c8ccd4]">{nextModule.title}</span>
            </Link>
          ) : (
            <Link
              href={`/courses/${course.slug}`}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-right outline-none ring-offset-2 ring-offset-[#0b0c0f] transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              <span className="block text-[11.5px] text-[#7f8794]">Back to</span>
              <span className="mt-0.5 block text-[13.5px] text-[#c8ccd4]">{course.title}</span>
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
