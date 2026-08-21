"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { PublicSlot, Shape, Source } from "@/lib/mock";
import { beginRound, previewRound, type Preview } from "./actions";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const minsWord = (s: number) => {
  const n = Math.round(s / 60);
  return `${n} ${n === 1 ? "minute" : "minutes"}`;
};

const SHAPE_COPY: Record<Shape, { title: string; sub: string }> = {
  split: { title: "Match the split", sub: "One SQL problem, one algorithms problem. What most mixed rounds actually look like." },
  sql: { title: "SQL only", sub: "Two SQL problems. The half most people under-prepare because it feels easy." },
  algo: { title: "Algorithms only", sub: "Two data-structure problems. No SQL at all." },
};

const card = "rounded-2xl border border-[#24262b] bg-[#17181c]";
const seg =
  "rounded-lg px-3 py-1.5 text-[12.5px] transition outline-none focus-visible:ring-2 focus-visible:ring-[#4aa3ff]";

function Glyph({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Six lines, a glyph each, on the same card as the button. Not a modal, and
 *  not a checkbox — a checkbox is friction theatre. The point is that the
 *  terms are legible, not that you clicked something. */
const CONTRACT: { d: string; b: string; t: string }[] = [
  { d: "M12 17h.01M12 7a3 3 0 0 1 2 5.2c-.8.6-2 1-2 2.3", b: "No hints.", t: "The panel is closed for the round, so you cannot spend one by reflex." },
  { d: "M4 5h16M4 12h10M4 19h7", b: "No solutions.", t: "Not during, and not the moment you pass. They unlock free on the scorecard." },
  { d: "M12 7v5l3 2", b: "One clock.", t: "across both problems — not half each. It does not pause and it does not stop for a phone call." },
  { d: "M8 5 3 12l5 7M16 5l5 7-5 7", b: "Move freely.", t: "Switch as often as you like; code, scratchpad and results are kept." },
  { d: "M3 12h4l3 8 4-16 3 8h4", b: "Zero is not a wall.", t: "You roll into overtime and it is scored on its own line, not cut off mid-thought." },
  { d: "M6 3h12l4 6-10 12L2 9z", b: "The round pays no gems.", t: "The problems inside it pay the normal first-clean-solve rate. The round itself pays nothing." },
];

const PREFLIGHT = [
  "Water and paper on the desk. You will want to draw the example.",
  "Phone face down, notifications off, one screen.",
  "Say it out loud as you go — silence is the thing that costs you.",
  "Record yourself if you can. Listening back is the fastest fix there is.",
];

export function PreRound({
  sources, last, roundsRun,
}: {
  sources: Source[];
  roundsRun: number;
  last: { id: string; when: string; elapsed: number; solved: number; of: number } | null;
}) {
  const companies = sources.filter((s) => s.kind === "company");
  const packs = sources.filter((s) => s.kind === "pack");
  const [kind, setKind] = useState<"company" | "pack">(companies.length ? "company" : "pack");
  const [sourceId, setSourceId] = useState((companies[0] ?? packs[0])?.id ?? "");
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const [shape, setShape] = useState<Shape>(source?.shape ?? "split");
  const [length, setLength] = useState<number>(source?.length ?? 45);
  const [roll, setRoll] = useState(0);
  const [nudge, setNudge] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // The composition happens on the server, so the browser never learns a
  // title or a pattern before the clock starts.
  useEffect(() => {
    let alive = true;
    startTransition(async () => {
      const p = await previewRound({ sourceId, shape, length, roll });
      if (alive) setPreview(p);
    });
    return () => { alive = false; };
  }, [sourceId, shape, length, roll]);

  const choose = (id: string) => {
    const s = sources.find((x) => x.id === id);
    if (!s) return;
    setSourceId(id); setShape(s.shape); setLength(s.length); setRoll(0);
  };

  const slots: PublicSlot[] = preview?.ok ? preview.slots : [];
  const seconds = preview?.ok ? preview.seconds : length * 60;
  const slack = preview?.ok ? preview.slackSeconds : 0;

  const start = async () => {
    setStarting(true); setError(null);
    const res = await beginRound({ sourceId, shape, length, roll });
    // A successful start redirects, so anything returned is a refusal.
    if (res && !res.ok) { setError(res.error); setStarting(false); }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-10">
      <header className="mb-9 max-w-2xl">
        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11.5px] uppercase tracking-wider text-[#8b929d]">
          Mock interview{roundsRun > 0 ? ` · round ${roundsRun + 1}` : ""}
        </span>
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight">A real round, start to finish.</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[#9aa1ad]">
          Two problems, one clock across both, no hints and no solutions. Then a scorecard that
          tells you where the time actually went — with no score on it.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- setup ---------------- */}
        <div className="space-y-5">
          <section className={`${card} p-6`} aria-labelledby="s1h">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="s1h" className="text-[16px] font-semibold">
                <span className="mr-2 text-[#4c525d]">1</span> Who are you practicing for?
              </h2>
              <span className="text-[12px] text-[#7f8794]">
                {source?.kind === "company" ? "Sets the split, the difficulty and the clock." : "The pack's own spread, no company calibration."}
              </span>
            </div>

            <div className="mb-4 inline-flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1" role="group" aria-label="Source kind">
              {(["company", "pack"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setKind(k); const first = (k === "company" ? companies : packs)[0]; if (first) choose(first.id); }}
                  aria-pressed={kind === k}
                  className={`${seg} ${kind === k ? "bg-white/[0.1] text-white" : "text-[#8b929d] hover:text-white"}`}
                >
                  {k === "company" ? "A company" : "A pack"}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(kind === "company" ? companies : packs).map((s) => {
                const on = s.id === sourceId;
                return (
                  <button
                    key={s.id}
                    onClick={() => choose(s.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[#4aa3ff] ${
                      on ? "border-[#00E5FF]/50 bg-[#00E5FF]/[0.07]" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] font-mono text-[11px] text-[#c8ccd4]">
                      {s.mono}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-white">{s.name}</span>
                      <span className="block truncate text-[11.5px] text-[#7f8794]">{s.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {source && (
              <div className="mt-4 space-y-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                {source.facts.map((f) => (
                  <div key={f.k} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-[12.5px]">
                    <span className="text-[#6f747c]">{f.k}</span>
                    <span className="leading-relaxed text-[#9aa1ad]">{f.v}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${card} p-6`} aria-labelledby="s2h">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="s2h" className="text-[16px] font-semibold">
                <span className="mr-2 text-[#4c525d]">2</span> Round shape
              </h2>
              <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1" role="group" aria-label="Round length">
                {[25, 45, 60].map((n) => (
                  <button key={n} onClick={() => { setLength(n); setRoll(0); }} aria-pressed={length === n}
                          className={`${seg} ${length === n ? "bg-white/[0.1] text-white" : "text-[#8b929d] hover:text-white"}`}>
                    {n} min
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {(Object.keys(SHAPE_COPY) as Shape[]).map((id) => {
                const on = id === shape;
                return (
                  <button
                    key={id}
                    onClick={() => { setShape(id); setRoll(0); }}
                    aria-pressed={on}
                    className={`relative rounded-xl border px-4 py-3.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[#4aa3ff] ${
                      on ? "border-[#00E5FF]/50 bg-[#00E5FF]/[0.07]" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    {source?.shape === id && (
                      <span className="absolute right-3 top-3 rounded-full bg-[#9E7BFF]/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#c3adff]">
                        recommended
                      </span>
                    )}
                    <span className="block text-[13.5px] font-medium text-white">{SHAPE_COPY[id].title}</span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-[#8b929d]">{SHAPE_COPY[id].sub}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${card} p-6`} aria-labelledby="s3h">
            <h2 id="s3h" className="mb-3 text-[16px] font-semibold">
              <span className="mr-2 text-[#4c525d]">3</span> Before you start
            </h2>
            <ul className="space-y-1.5">
              {PREFLIGHT.map((p) => (
                <li key={p} className="flex gap-2.5 text-[13px] leading-relaxed text-[#9aa1ad]">
                  <span className="mt-0.5 text-[#4c525d]">
                    <Glyph d="M20 6 9 17l-5-5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <input
                type="checkbox" checked={nudge} onChange={(e) => setNudge(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00E5FF]"
              />
              <span className="text-[12.5px] leading-relaxed text-[#9aa1ad]">
                <b className="text-[#c8ccd4]">Nudge me if I go quiet.</b> After 45 seconds with no keystroke, one
                small card asks whether an interviewer would know what you are thinking. It never mentions the
                problem — narration is the job, and silent practice trains the wrong thing.
              </span>
            </label>
          </section>
        </div>

        {/* ---------------- the round ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#8b929d]">Your round</h2>
              <button
                onClick={() => setRoll((r) => r + 1)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] text-[#c8ccd4] transition hover:bg-white/[0.06]"
                title="Draw a different pair"
              >
                <Glyph d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
                Reroll
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-baseline gap-2">
                <b className="font-mono text-[26px] tracking-tight text-white">{mmss(seconds)}</b>
                <span className="text-[12px] text-[#6f747c]">one clock, both problems</span>
              </div>
              <p className="mt-1 text-[12.5px] text-[#8b929d]">
                Against <b className="text-[#c8ccd4]">{source?.name}</b>.{" "}
                {shape === "split" ? "One SQL problem, one algorithms problem."
                  : shape === "sql" ? "Two SQL problems." : "Two algorithms problems."}
              </p>

              <div className="mt-4 space-y-2">
                {(slots.length ? slots : [null, null]).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.06] font-mono text-[11px] text-[#8b929d]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-[#e6e8ec]">
                        {s ? (s.kind === "sql" ? "One SQL query" : "One Python function") : "…"}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[11.5px] text-[#6f747c]">
                        {s && (
                          <span className={`rounded-md px-1.5 py-0.5 ${
                            s.difficulty === "easy" ? "bg-[#12331f] text-[#7fe0a2]"
                              : s.difficulty === "hard" ? "bg-[#331616] text-[#ff9d9d]"
                                : "bg-[#2c2a12] text-[#e2d07a]"}`}>
                            {s.difficulty}
                          </span>
                        )}
                        title and pattern hidden until you start
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-[#8b929d]">
                      {s ? `~${s.minutes} min` : ""}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-[#7f8794]">
                {slack > 0 ? (
                  <><b className="text-[#c8ccd4]">{minsWord(slack)} of slack.</b> Real rounds leave room to restate the
                    question, walk an example and ask about the edge cases. Spend it.</>
                ) : (
                  <><b className="text-[#c8ccd4]">No slack.</b> The two budgets already use the whole clock — this shape is
                    deliberately tight.</>
                )}
              </p>

              {preview && !preview.ok && (
                <p role="alert" className="mt-3 rounded-lg border border-[#5c2b2b] bg-[#2a1618] px-3 py-2 text-[12.5px] text-[#ff9d9d]">
                  {preview.error}
                </p>
              )}
            </div>
          </section>

          <section className={`${card} px-5 py-4`} aria-labelledby="contractH">
            <h3 id="contractH" className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#8b929d]">
              The contract
            </h3>
            <ul className="space-y-2.5">
              {CONTRACT.map((c) => (
                <li key={c.b} className="flex gap-2.5 text-[12.5px] leading-relaxed text-[#8b929d]">
                  <span className="mt-0.5 shrink-0 text-[#4aa3ff]"><Glyph d={c.d} /></span>
                  <span>
                    <b className="text-[#c8ccd4]">{c.b}</b>{" "}
                    {c.b === "One clock." ? `${Math.round(seconds / 60)} minutes ${c.t}` : c.t}
                  </span>
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-[#5c2b2b] bg-[#2a1618] px-3 py-2 text-[12.5px] text-[#ff9d9d]">
                {error}
              </p>
            )}

            <button
              onClick={start}
              disabled={starting || !preview?.ok}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-3 text-[14px] font-semibold text-[#0b0c0f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {starting ? "Starting…" : `Start the round · ${mmss(seconds)}`}
            </button>
            <p className="mt-2 text-center text-[11.5px] text-[#6f747c]">
              The clock starts on the server the moment you press it.
            </p>
          </section>

          {last && (
            <p className="px-1 text-[12px] leading-relaxed text-[#7f8794]">
              Your last round · <b className="text-[#9aa1ad]">{last.when}</b> · {last.solved} of {last.of} solved in{" "}
              <span className="font-mono">{mmss(last.elapsed)}</span>.{" "}
              <Link href={`/mock/${last.id}/scorecard`} className="text-[#4aa3ff] underline underline-offset-2">
                See that scorecard
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
