import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { AppHeader } from "@/components/AppHeader";
import { companies, mockRoundProblems, mockRounds, problems } from "@/db/schema";
import { patternHistory } from "@/lib/mock";
import {
  ACTIVITIES, ACTIVITY_LABEL, buildCallouts, buildNext, buildVerdict, dur, eyebrow,
  mmss, patternRows, problemNote, standing, summarise,
  type Block, type RoundEvent, type SlotInput,
} from "@/lib/mock-scorecard";
import { userStats } from "@/lib/stats";
import { Timeline } from "./Timeline";

export const metadata = { title: "Round scorecard — Aptivus" };
export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-[#24262b] bg-[#17181c]";
const SWATCH: Record<string, string> = {
  read: "repeating-linear-gradient(45deg,#9E7BFF 0 3px,rgba(158,123,255,.2) 3px 7px)",
  write: "#00E5FF",
  debug: "radial-gradient(#e6b455 1.5px, rgba(230,180,85,.16) 1.6px)",
  idle: "radial-gradient(#6f747c 1px, rgba(111,116,124,.08) 1.1px)",
};

const OUTCOME: Record<string, { label: string; cls: string; glyph: string }> = {
  solved: { label: "Solved", cls: "bg-[#12331f] text-[#7fe0a2]", glyph: "✓" },
  partial: { label: "Not solved", cls: "bg-[#2c2a12] text-[#e2d07a]", glyph: "–" },
  unfinished: { label: "Never ran", cls: "bg-[#2c2a12] text-[#e2d07a]", glyph: "–" },
  stopped: { label: "Stopped early", cls: "bg-[#221a33] text-[#c3adff]", glyph: "■" },
};

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/mock/${id}/scorecard`);
  const userId = session.user.id;

  const [round] = await db.select().from(mockRounds).where(eq(mockRounds.id, id)).limit(1);
  if (!round || round.userId !== userId) notFound();
  // A round still running has an editor, not a scorecard.
  if (round.status === "in_progress") redirect(`/mock/${id}`);

  const slots = await db
    .select()
    .from(mockRoundProblems)
    .where(eq(mockRoundProblems.roundId, round.id))
    .orderBy(asc(mockRoundProblems.orderIndex));

  const rows = slots.length
    ? await db.select().from(problems).where(inArray(problems.id, slots.map((s) => s.problemId)))
    : [];

  const patterns = rows.map((r) => r.pattern ?? "").filter(Boolean);
  const [history, stats] = await Promise.all([patternHistory(userId, patterns), userStats(userId)]);

  let sourceName = round.pack ? `${round.pack} pack` : "General";
  if (round.companySlug) {
    const [co] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.slug, round.companySlug))
      .limit(1);
    sourceName = co?.name ?? round.companySlug;
  }

  const slotInputs: SlotInput[] = slots.map((s) => {
    const row = rows.find((r) => r.id === s.problemId);
    const body = (row?.body ?? {}) as { tests?: unknown[] };
    const isSql = row?.kind === "sql";
    const pattern = row?.pattern ?? null;
    return {
      index: s.orderIndex,
      slug: row?.slug ?? "",
      title: row?.title ?? "Problem",
      kind: isSql ? "sql" : "code",
      difficulty: row?.difficulty ?? "medium",
      pattern,
      minutesBudget: row?.minutes ?? 15,
      solved: s.solved,
      stopped: s.stopped,
      attempts: s.attempts,
      timeSpentMs: s.timeSpentMs,
      firstRunAt: s.firstRunAt,
      solvedAt: s.solvedAt,
      checksPassed: s.checksPassed,
      checksTotal: s.checksTotal,
      testTotal: isSql ? 1 : (body.tests?.length ?? 1),
      history: (pattern && history[pattern]) || { clean: 0, seen: 0 },
    };
  });

  const activity = round.activity ?? { blocks: [], events: [] };
  const S = summarise(
    {
      startedAt: round.startedAt,
      endedAt: round.endedAt ?? round.startedAt,
      durationSeconds: round.durationSeconds,
      sourceName,
      shape: round.shape,
      blocks: activity.blocks as Block[],
      events: activity.events as RoundEvent[],
    },
    slotInputs,
  );

  const verdict = buildVerdict(S);
  const callouts = buildCallouts(S);
  const next = buildNext(S);
  const firstKey = S.P.filter((p) => p.firstKeyDelay != null).sort((a, b) => a.index - b.index)[0];
  const when = new Date(round.startedAt * 1000).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const facts: { k: string; v: string; small?: string; help: string }[] = [
    {
      k: "Solved", v: String(S.solvedCount), small: `of ${S.P.length}`,
      help: S.P.map((p) => (p.kind === "sql" ? "SQL" : "algorithms")).join(" · "),
    },
    {
      k: "Clock", v: mmss(S.total),
      help: S.over ? `+${mmss(S.over)} past ${mmss(S.len)}` : `${mmss(S.unspent)} unspent of ${mmss(S.len)}`,
    },
    {
      k: "Checks passed", v: String(S.checks), small: `of ${S.checksTotal}`,
      help: `across ${S.P.reduce((a, p) => a + p.attempts, 0)} run${S.P.reduce((a, p) => a + p.attempts, 0) === 1 ? "" : "s"}`,
    },
    {
      k: "First keystroke", v: firstKey ? mmss(firstKey.firstKeyDelay ?? 0) : "—",
      help: firstKey ? `after opening problem ${firstKey.index + 1}` : "never typed",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="mb-2.5 flex items-center gap-2 text-[11.5px] uppercase tracking-wider text-[#8b929d]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2.2"
                   strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
              {eyebrow(S)}
            </span>
            <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Round scorecard</h1>
            <p className="mt-2 text-[12.5px] text-[#7f8794]">
              {when} · <span className="font-mono">{mmss(S.total)}</span> on the clock
              {S.over ? <> (<span className="font-mono text-[#ff9d9d]">+{mmss(S.over)}</span> overtime)</> : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/mock" className="rounded-xl border border-white/12 px-4 py-2 text-[13px] text-[#c8ccd4] transition hover:bg-white/[0.06]">
              Run another round
            </Link>
          </div>
        </header>

        {/* ---------- the verdict: prose, and no number anywhere ---------- */}
        <section className={`${card} mb-6 overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#8b929d]">
              What an interviewer would take away
            </h2>
            <span className="rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/[0.08] px-2.5 py-1 text-[11px] text-[#7fe6f5]">
              your round
            </span>
          </div>
          <div className="px-6 py-6">
            {verdict.map((p, i) => (
              <p key={i} className={`text-[19px] leading-[1.55] text-[#dfe1e5] ${i ? "mt-4" : ""}`}>{p}</p>
            ))}

            <div className="mt-7 grid gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
              {facts.map((f) => (
                <div key={f.k} className="bg-[#17181c] px-4 py-3.5">
                  <p className="text-[11px] uppercase tracking-wider text-[#6f747c]">{f.k}</p>
                  <p className="mt-1.5 font-mono text-[24px] leading-none text-white">
                    {f.v}
                    {f.small && <small className="ml-1.5 text-[14px] font-normal text-[#6f747c]">{f.small}</small>}
                  </p>
                  <p className="mt-2 text-[11.5px] text-[#7f8794]">{f.help}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- the timeline ---------- */}
        <section className={`${card} mb-6 overflow-hidden`}>
          <div className="border-b border-white/[0.07] px-6 py-3.5">
            <h2 className="text-[16px] font-semibold">Where the time actually went</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#7f8794]">
              A heuristic, and worth naming as one: a keystroke in the last three seconds counts as writing, time after
              a failing run counts as debugging, time before the first run counts as reading, everything else is
              thinking. Paper and pencil produce no keystrokes, so long thinking reads as idle.
            </p>
          </div>
          <div className="px-6 py-5">
            <Timeline S={S} />

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-[#8b929d]">
              {ACTIVITIES.map((a) => (
                <span key={a} className="flex items-center gap-2">
                  <i className="h-3 w-5 rounded-[3px] border border-[#24262b]" style={{ background: SWATCH[a], backgroundSize: "6px 6px" }} />
                  {ACTIVITY_LABEL[a]} <b className="font-mono text-[#c8ccd4]">{dur(S.act[a])}</b>
                </span>
              ))}
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#00E5FF]" />problem 1</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#9E7BFF]" />problem 2</span>
              </span>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {callouts.map((c, i) => (
                <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <b className="block font-mono text-[19px] text-white">{c.value}</b>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[#8b929d]">{c.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- problem by problem ---------- */}
        <section className="mb-6">
          <h2 className="mb-1 text-[16px] font-semibold">Problem by problem</h2>
          <p className="mb-4 text-[12.5px] text-[#7f8794]">
            The pattern each one was testing is named here and was deliberately not named before — nor was the
            &ldquo;why this one&rdquo; note at the foot of each prompt, which gives the trap away. Knowing either in
            advance is the difference between practice and a mock. Both are open again from here, free.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {S.P.map((p) => {
              const oc = OUTCOME[p.outcome];
              const tt = Math.max(1, p.t.total);
              return (
                <article key={p.slug || p.index} className={`${card} flex flex-col overflow-hidden`}>
                  <div className="border-b border-white/[0.07] px-5 py-4">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`rounded-md px-2 py-0.5 ${
                        p.difficulty === "easy" ? "bg-[#12331f] text-[#7fe0a2]"
                          : p.difficulty === "hard" ? "bg-[#331616] text-[#ff9d9d]" : "bg-[#2c2a12] text-[#e2d07a]"}`}>
                        {p.difficulty}
                      </span>
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[#c8ccd4]">{p.kind === "sql" ? "SQL" : "Python"}</span>
                      <span className={`ml-auto rounded-md px-2 py-0.5 ${oc.cls}`}>
                        <span aria-hidden>{oc.glyph}</span> {oc.label}
                      </span>
                    </div>
                    <h3 className="text-[15.5px] font-semibold leading-snug">{p.title}</h3>
                    <p className="mt-1.5 text-[12px] text-[#7f8794]">
                      Tested: <b className="text-[#c8ccd4]">{p.pattern ?? "unclassified"}</b>
                      {p.history.seen > 0 && <> · your history {p.history.clean} of {p.history.seen}</>}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-px border-b border-white/[0.07] bg-white/[0.05]">
                    {[
                      { k: "Time", v: mmss(p.t.total), s: `/ ${Math.round(p.budget / 60)}m`, warn: p.t.total > p.budget * 1.4 },
                      { k: "Checks", v: p.checks ? String(p.checks.passed) : "—", s: p.checks ? `/ ${p.checks.total}` : "", ok: p.solved },
                      { k: "Runs", v: String(p.attempts), s: p.firstRunAt ? `first at ${mmss(p.firstRunAt - round.startedAt)}` : "" },
                    ].map((s) => (
                      <div key={s.k} className="bg-[#17181c] px-4 py-3">
                        <p className="text-[10.5px] uppercase tracking-wider text-[#6f747c]">{s.k}</p>
                        <p className={`mt-1 font-mono text-[16px] ${s.warn ? "text-[#e6b455]" : s.ok ? "text-[#7fe0a2]" : "text-[#e6e8ec]"}`}>
                          {s.v}<small className="ml-1 text-[10.5px] font-normal text-[#6f747c]">{s.s}</small>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="px-5 py-3.5">
                    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      {ACTIVITIES.map((a) => (
                        <i key={a} style={{ width: `${(p.t[a] / tt) * 100}%`, background: SWATCH[a], backgroundSize: "6px 6px", opacity: a === "idle" ? 0.55 : 1 }} />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#7f8794]">
                      {ACTIVITIES.map((a) => (
                        <span key={a}>{ACTIVITY_LABEL[a].toLowerCase()} <b className="font-mono text-[#9aa1ad]">{dur(p.t[a])}</b></span>
                      ))}
                    </div>
                  </div>

                  <div className="mx-5 mb-4 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                    <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6f747c]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                           strokeLinecap="round" aria-hidden="true">
                        <path d="M8 10h8M8 14h5" /><path d="M21 12a9 9 0 1 1-3.2-6.9" />
                      </svg>
                      What an interviewer would have written
                    </p>
                    {problemNote(p).map((b, i) => (
                      <p key={i} className={`text-[13px] leading-relaxed text-[#c8ccd4] ${i ? "mt-2.5" : ""}`}>{b}</p>
                    ))}
                  </div>

                  <div className="flex gap-2 border-t border-white/[0.07] px-5 py-3.5">
                    <Link href={`/practice/${p.slug}`}
                          className="rounded-lg bg-[#00E5FF]/15 px-3.5 py-2 text-[12.5px] font-medium text-[#7fe6f5] transition hover:bg-[#00E5FF]/25">
                      Open the write-up
                    </Link>
                    <Link href={`/practice/${p.slug}`}
                          className="rounded-lg px-3.5 py-2 text-[12.5px] text-[#8b929d] transition hover:text-white">
                      Retry untimed
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------- patterns ---------- */}
        <section className={`${card} mb-6 overflow-hidden`}>
          <div className="border-b border-white/[0.07] px-6 py-3.5">
            <h2 className="text-[16px] font-semibold">Patterns this round tested</h2>
            <p className="mt-1 text-[12px] text-[#7f8794]">Against your own history, never against anybody else&apos;s.</p>
          </div>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[#6f747c]">
                <th className="px-6 py-2.5 font-medium">Pattern</th>
                <th className="px-6 py-2.5 font-medium">This round</th>
                <th className="px-6 py-2.5 font-medium">Your history</th>
                <th className="px-6 py-2.5 font-medium">Standing</th>
              </tr>
            </thead>
            <tbody>
              {patternRows(S).map((p) => {
                const st = standing(p.history.clean, p.history.seen);
                return (
                  <tr key={p.slug || p.index} className="border-t border-white/[0.06]">
                    <td className="px-6 py-3">
                      <b className="text-[#e6e8ec]">{p.pattern ?? "unclassified"}</b>
                      <div className="text-[11px] text-[#6f747c]">{p.title}</div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] ${OUTCOME[p.outcome].cls}`}>
                        {p.solved ? "clean" : p.stopped ? "stopped" : p.checks ? `${p.checks.passed} of ${p.checks.total}` : "no run"}
                      </span>
                      <div className="mt-1 font-mono text-[11px] text-[#6f747c]">{mmss(p.t.total)} spent</div>
                    </td>
                    <td className="px-6 py-3 text-[#8b929d]">
                      {p.history.seen ? `${p.history.clean} clean of ${p.history.seen}` : "first time"}
                    </td>
                    <td className={`px-6 py-3 font-medium ${
                      st.tone === "bad" ? "text-[#ff9d9d]" : st.tone === "warn" ? "text-[#e6b455]" : "text-[#7fe0a2]"}`}>
                      {st.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ---------- what to do next ---------- */}
        <section className="mb-6">
          <h2 className="mb-1 text-[16px] font-semibold">What to work on next</h2>
          <p className="mb-4 text-[12.5px] text-[#7f8794]">Weakest pattern first, then the process work. Three things, not ten.</p>
          <div className="space-y-2.5">
            {next.map((n, i) => (
              <div key={n.title} className={`${card} flex flex-wrap items-start gap-4 px-5 py-4 ${i === 0 ? "border-[#00E5FF]/25" : ""}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[12px] ${
                  i === 0 ? "bg-[#00E5FF]/15 text-[#7fe6f5]" : "bg-white/[0.06] text-[#8b929d]"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[14px] text-white">{n.title}</b>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#9aa1ad]">{n.body}</p>
                </div>
                <Link
                  href={n.again ? "/mock" : n.slug ? `/practice/${n.slug}` : "/problems"}
                  className={`shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition ${
                    i === 0 ? "bg-[#00E5FF]/15 text-[#7fe6f5] hover:bg-[#00E5FF]/25"
                      : "border border-white/12 text-[#c8ccd4] hover:bg-white/[0.06]"}`}
                >
                  {n.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- gems ---------- */}
        <section className={`${card} px-6 py-4`}>
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-[#9aa1ad]">
            <span aria-hidden className="text-[#4aa3ff]">◆</span>
            {S.gems > 0 ? (
              <span>
                <b className="text-white">+{S.gems} gems</b> — first clean solve of{" "}
                {S.P.filter((p) => p.solved).map((p) => p.title).join(" and ")}. The round itself paid nothing.
              </span>
            ) : (
              <span>
                <b className="text-white">+0 gems.</b> Nothing was solved clean, and the round itself never pays.
                That is deliberate.
              </span>
            )}
          </p>
          <details className="mt-3 text-[12.5px] text-[#7f8794]">
            <summary className="cursor-pointer text-[#4aa3ff]">Why does a mock pay nothing?</summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>
                Any per-round award is farmable by starting a round and immediately ending it, and an award that scales
                with completion pays more for a round you abandoned early than for one you fought to the wire. Neither
                is a loop worth building.
              </p>
              <p>
                The problems inside a round pay their normal first-clean-solve rate — 2, 4 or 6 by difficulty, against
                the same daily cap. A mock offers no hints and no solutions, so every solve inside one is clean by
                definition, and it is clean under the hardest conditions available. Paying it less than the same
                problem solved untimed with five hints on the table would be an incentive to avoid the thing this
                product most wants you to do.
              </p>
              <p>
                One thing the round gives away free: <b className="text-[#9aa1ad]">both write-ups are unlocked now</b>,
                whatever the outcome. The moment after a round you just lost is the highest-learning moment there is,
                and charging for it monetises giving up at exactly the wrong time.
              </p>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
