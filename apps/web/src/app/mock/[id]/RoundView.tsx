"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { getEngine, type ResultRow, type TestCase } from "@/lib/engine-client";
import { previewTables, runQuery, type SqlResult } from "@/lib/sql-client";
import type { Activity, Block, RoundEvent } from "@/lib/mock-scorecard";

export type RoundProblem = {
  index: number;
  slug: string;
  title: string;
  difficulty: string;
  minutes: number;
  kind: "sql" | "code";
  prompt: string;
  starter: string;
  scratch: string;
  func: string;
  sampleTests: TestCase[];
  hiddenCount: number;
  sqlSchema: string;
  sqlSeed: string;
  solved: boolean;
  stopped: boolean;
};

type PState = {
  code: string;
  scratch: string;
  runs: number;
  lastRun: { pass: number; total: number } | null;
  results: ResultRow[] | null;
  sqlOut: SqlResult | null;
  solved: boolean;
  stopped: boolean;
  done: boolean;
  banner: { tone: "ok" | "bad"; text: string } | null;
};

const mmss = (s: number) => {
  const n = Math.abs(Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

const btn =
  "rounded-lg px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-[#4aa3ff]";

const PROBLEM_COLOR = ["#00E5FF", "#9E7BFF"];

/** Contiguous stretches on one problem, for the clock bar's colour runs. */
function mergeByProblem(blocks: Block[]): { p: number; d: number }[] {
  const out: { p: number; d: number }[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.p === b.p) last.d += b.d;
    else out.push({ p: b.p, d: b.d });
  }
  return out;
}

function RowTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  if (!columns.length) return <p className="text-[12.5px] text-[#8b929d]">No columns returned.</p>;
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-white/[0.08]">
      <table className="w-full border-collapse font-mono text-[11.5px]">
        <thead className="sticky top-0 bg-white/[0.06]">
          <tr>{columns.map((c) => (
            <th key={c} className="border-b border-white/[0.08] px-2.5 py-1.5 text-left font-medium text-[#c8ccd4]">{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.02]">
              {r.map((v, j) => (
                <td key={j} className="border-b border-white/[0.04] px-2.5 py-1.5 text-[#9aa1ad]">
                  {v === null ? <span className="text-[#5f646d]">NULL</span> : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-2.5 py-3 text-[12px] text-[#8b929d]">No rows.</p>}
    </div>
  );
}

export function RoundView({
  roundId, durationSeconds, elapsedAtLoad, problems, initialBlocks = [], initialEvents = [],
}: {
  roundId: string;
  durationSeconds: number;
  elapsedAtLoad: number;
  problems: RoundProblem[];
  initialBlocks?: Block[];
  initialEvents?: RoundEvent[];
}) {
  const firstOpen = Math.max(0, problems.findIndex((p) => !p.solved && !p.stopped));
  const [cur, setCur] = useState(firstOpen);
  /** What the clock displays. Derived once a second from the trace below. */
  const [clock, setClock] = useState<{ elapsed: number; seconds: number[]; bar: { p: number; d: number }[] }>(
    () => ({
      elapsed: elapsedAtLoad,
      seconds: problems.map((_, i) => initialBlocks.filter((b) => b.p === i).reduce((n, b) => n + b.d, 0)),
      bar: mergeByProblem(initialBlocks),
    }),
  );
  const [state, setState] = useState<PState[]>(() =>
    problems.map((p) => ({
      code: p.starter, scratch: p.scratch, runs: 0, lastRun: null, results: null,
      sqlOut: null, solved: p.solved, stopped: p.stopped, done: false, banner: null,
    })),
  );
  const [tab, setTab] = useState<"statement" | "scratch" | "schema">("statement");
  const [hush, setHush] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [live, setLive] = useState("");
  const [tables, setTables] = useState<Awaited<ReturnType<typeof previewTables>>>([]);

  /**
   * The trace, and the mirrors the once-a-second tick reads.
   *
   * A ref rather than state because it is written every second and read only
   * when it is sent; putting a 2700-entry array through setState would
   * re-render the editor sixty times a minute for nothing. Everything the
   * screen shows is copied into `clock` on the same tick.
   */
  const store = useRef({
    elapsed: elapsedAtLoad,
    blocks: initialBlocks.slice(),
    events: initialEvents.slice(),
    lastKeyAt: -999,
    seconds: problems.map((_, i) => initialBlocks.filter((b) => b.p === i).reduce((n, b) => n + b.d, 0)),
    nudgedAt: -999,
    live: true,
    nudgeOn: true,
    cur: firstOpen,
    state: [] as PState[],
    said: {} as Record<string, boolean>,
    engine: getEngine(),
  });

  const P = problems[cur];
  const S = state[cur];
  const elapsed = clock.elapsed;
  const left = durationSeconds - elapsed;

  /** The single writer of per-problem state, so the mirror cannot drift. */
  const patch = useCallback((i: number, next: Partial<PState>) => {
    setState((s) => {
      const out = s.map((x, n) => (n === i ? { ...x, ...next } : x));
      store.current.state = out;
      return out;
    });
  }, []);

  /* --------------------------------------------------------------
   * the clock. It counts locally for smoothness and is re-anchored to
   * the server on every sync, because the server is the one that knows.
   * ------------------------------------------------------------ */
  useEffect(() => {
    store.current.state = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const s = store.current;
      if (!s.live) return;
      s.elapsed += 1;
      s.seconds[s.cur] += 1;

      const st = s.state[s.cur];
      const a: Activity =
        !st || st.stopped || st.done || st.solved ? "idle"
          : s.elapsed - s.lastKeyAt <= 3 ? "write"
            : st.lastRun && st.lastRun.pass < st.lastRun.total ? "debug"
              : st.runs === 0 ? "read"
                : "idle";
      const last = s.blocks[s.blocks.length - 1];
      if (last && last.p === s.cur && last.a === a) last.d += 1;
      else s.blocks.push({ p: s.cur, a, d: 1 });

      const remaining = durationSeconds - s.elapsed;
      if (remaining === 300 && !s.said.five) { s.said.five = true; setLive("Five minutes left."); }
      if (remaining === 60 && !s.said.one) { s.said.one = true; setLive("One minute left."); }
      if (remaining === 0 && !s.said.zero) {
        s.said.zero = true;
        setLive("Time. You are into overtime — nothing has closed, and it is scored on its own line.");
      }
      // The one process nudge. It never mentions the problem, and it was
      // disclosed in the contract before the clock started.
      if (s.nudgeOn && s.lastKeyAt >= 0 && s.elapsed - s.lastKeyAt === 45 && s.elapsed - s.nudgedAt > 120) {
        s.nudgedAt = s.elapsed;
        setNudge(true);
        setTimeout(() => setNudge(false), 9000);
      }
      setClock({ elapsed: s.elapsed, seconds: s.seconds.slice(), bar: mergeByProblem(s.blocks) });
    }, 1000);
    return () => clearInterval(id);
  }, [durationSeconds]);

  /* --------------------------------------------------------------
   * the heartbeat
   * ------------------------------------------------------------ */
  const sync = useCallback(async () => {
    const s = store.current;
    const body = {
      blocks: s.blocks,
      events: s.events,
      problems: s.state.map((p, i) => ({
        index: i, seconds: s.seconds[i], code: p.code, scratch: p.scratch, stopped: p.stopped,
      })),
    };
    try {
      const res = await fetch(`/api/mock/${roundId}/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { elapsed: number; status: string };
      if (typeof data.elapsed !== "number") return;
      // The server's clock is the clock. If this tab was asleep, the gap
      // arrives here and is booked as idle rather than quietly forgiven.
      if (data.elapsed > s.elapsed) {
        s.blocks.push({ p: s.cur, a: "idle", d: data.elapsed - s.elapsed });
        s.seconds[s.cur] += data.elapsed - s.elapsed;
      }
      s.elapsed = data.elapsed;
      setClock({ elapsed: s.elapsed, seconds: s.seconds.slice(), bar: mergeByProblem(s.blocks) });
    } catch {
      /* offline: the local clock keeps running and reconciles on the next beat */
    }
  }, [roundId]);

  useEffect(() => {
    const id = setInterval(sync, 10_000);
    return () => clearInterval(id);
  }, [sync]);

  /* boot the engine / the SQL preview for whichever problem is showing */
  useEffect(() => {
    let alive = true;
    const done = () => { if (alive) setBooting(false); };
    if (P.kind === "sql") {
      previewTables(P.sqlSchema, P.sqlSeed)
        .then((t) => { if (alive) { setTables(t); setBooting(false); } })
        .catch(done);
    } else {
      store.current.engine.warm().then(done).catch(done);
    }
    return () => { alive = false; };
  }, [P.kind, P.sqlSchema, P.sqlSeed]);

  const note = (k: RoundEvent["k"], p: number, extra: { pass?: number; total?: number } = {}) => {
    store.current.events.push({ at: store.current.elapsed, p, k, ...extra });
  };

  const select = (i: number) => {
    if (i === cur || i < 0 || i >= problems.length) return;
    note("switch", i);
    // The mirror moves with the tab, so the next tick books its second
    // against the problem you are now actually looking at.
    store.current.cur = i;
    setCur(i);
    setTab("statement");
    setBooting(problems[i].kind !== problems[cur].kind ? true : false);
  };

  const onCode = (v: string) => {
    store.current.lastKeyAt = store.current.elapsed;
    setNudge(false);
    patch(cur, { code: v });
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); }
    catch (e) { patch(store.current.cur, { banner: { tone: "bad", text: (e as Error).message } }); }
    finally { setBusy(null); }
  };

  /* ---- run: samples in the browser, exactly as the solve view does ---- */
  const run = () => guard("run", async () => {
    const i = store.current.cur;
    const p = problems[i];
    const st = store.current.state[i];
    if (p.kind === "sql") {
      const out = await runQuery(p.sqlSchema, p.sqlSeed, st.code);
      note("run", i);
      patch(i, {
        sqlOut: out, runs: st.runs + 1,
        banner: out.ok
          ? { tone: "ok", text: `${out.rows.length} row${out.rows.length === 1 ? "" : "s"} returned` }
          : { tone: "bad", text: out.error },
        // A query that errors is a failing run, and the timeline should say so.
        lastRun: out.ok ? st.lastRun : { pass: 0, total: 1 },
      });
      void sync();
      return;
    }
    const { results } = await store.current.engine.run(st.code, p.sampleTests, "function", p.func);
    const passed = results.filter((r) => r.passed).length;
    note("run", i, { pass: passed, total: results.length });
    patch(i, {
      results, runs: st.runs + 1, lastRun: { pass: passed, total: results.length },
      banner: { tone: passed === results.length ? "ok" : "bad", text: `Sample tests: ${passed}/${results.length} passed` },
    });
    void sync();
  });

  /* ---- submit: graded on the server, which is also what marks it solved ---- */
  const submit = () => guard("submit", async () => {
    const i = store.current.cur;
    const p = problems[i];
    const st = store.current.state[i];

    let payload: Record<string, unknown>;
    if (p.kind === "sql") {
      const out = await runQuery(p.sqlSchema, p.sqlSeed, st.code);
      patch(i, { sqlOut: out });
      if (!out.ok) { patch(i, { banner: { tone: "bad", text: out.error } }); return; }
      payload = { language: "sql", code: st.code, outputs: [], sqlRows: { columns: out.columns, rows: out.rows }, roundId };
    } else {
      const tRes = await fetch(`/api/problems/${p.slug}/tests`);
      if (!tRes.ok) { patch(i, { banner: { tone: "bad", text: "Could not load the tests." } }); return; }
      const { tests } = (await tRes.json()) as { tests: (TestCase & { index: number })[] };
      const { results: local } = await store.current.engine.run(st.code, tests, "function", p.func);
      payload = {
        language: "python", code: st.code, roundId,
        outputs: local.map((r, n) => (r.error
          ? { index: tests[n]?.index ?? n, ok: false, error: r.error }
          : { index: tests[n]?.index ?? n, ok: true, value: r.got })),
      };
    }

    const res = await fetch(`/api/problems/${p.slug}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { patch(i, { banner: { tone: "bad", text: data.error ?? "Submit failed." } }); return; }

    const solved = data.status === "solved";
    const passed = Number(data.testsPassed ?? 0);
    const total = Number(data.testsTotal ?? 1);
    note("run", i, { pass: passed, total });
    if (solved) note("solved", i);
    patch(i, {
      solved, runs: st.runs + 1, lastRun: { pass: passed, total },
      results: p.kind === "code"
        ? (data.results ?? []).map((r: { index: number; passed: boolean; sample: boolean }) => ({
            input: `test ${r.index + 1}`, expected: null, got: null,
            passed: r.passed, error: "", sample: r.sample, index: r.index,
          }))
        : st.results,
      banner: {
        tone: solved ? "ok" : "bad",
        text: solved
          ? `Solved — ${passed}/${total}${data.gems?.awarded ? ` · +${data.gems.awarded} gems` : ""}`
          : (data.sqlMessage ?? `${passed}/${total} checks passed`),
      },
    });
    void sync();
  });

  const markDone = () => {
    const i = store.current.cur;
    note("done", i);
    patch(i, { done: true });
    const other = problems.findIndex((_, n) => n !== i && !store.current.state[n].done && !store.current.state[n].stopped);
    if (other >= 0) select(other);
    else setEndOpen(true);
    void sync();
  };

  const stopHere = () => {
    const i = store.current.cur;
    note("stopped", i);
    patch(i, { stopped: true });
    const other = problems.findIndex((_, n) => n !== i && !store.current.state[n].done && !store.current.state[n].stopped);
    if (other >= 0) select(other);
    else setEndOpen(true);
    void sync();
  };

  const endRound = async () => {
    if (ending) return;
    setEnding(true);
    store.current.live = false;
    const s = store.current;
    const res = await fetch(`/api/mock/${roundId}/end`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: s.blocks, events: s.events,
        problems: store.current.state.map((p, i) => ({
          index: i, seconds: s.seconds[i], code: p.code, scratch: p.scratch, stopped: p.stopped,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    window.location.href = data.scorecard ?? `/mock/${roundId}/scorecard`;
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
      if (e.key === "Escape") { e.preventDefault(); setEndOpen((o) => !o); return; }
      if (e.altKey && (e.key === "1" || e.key === "2")) { e.preventDefault(); select(Number(e.key) - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---- the bar: elapsed coloured by which problem you were on ---- */
  const denom = Math.max(durationSeconds, elapsed);
  const merged = clock.bar;

  const soon = left <= 300 && left > 0;
  const over = left <= 0;
  const openCount = state.filter((s) => !s.solved && !s.stopped && !s.done).length;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#0b0c0f] text-[#e6e8ec]">
      <p className="sr-only" role="status" aria-live="polite">{live}</p>

      {/* ---------------- round bar ---------------- */}
      <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.07] px-4 py-2">
        <div className="flex min-w-0 flex-1 gap-2" role="tablist" aria-label="Problems in this round">
          {problems.map((p, i) => {
            const st = state[i];
            const on = i === cur;
            return (
              <button
                key={p.slug}
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => select(i)}
                className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[#4aa3ff] ${
                  on ? "border-white/15 bg-white/[0.07]" : "border-transparent hover:bg-white/[0.04]"
                }`}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-md font-mono text-[10.5px] text-[#0b0c0f]"
                  style={{ background: PROBLEM_COLOR[i % 2] }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[12.5px] ${on ? "text-white" : "text-[#9aa1ad]"}`}>{p.title}</span>
                  <span className="block font-mono text-[10.5px] text-[#6f747c]">{mmss(clock.seconds[i] ?? 0)}</span>
                </span>
                {st.stopped ? (
                  <span className="shrink-0 text-[11px] text-[#9E7BFF]" title="stopped">■<span className="sr-only"> stopped</span></span>
                ) : st.solved ? (
                  <span className="shrink-0 text-[12px] text-[#39c06c]" title="solved">✓<span className="sr-only"> solved</span></span>
                ) : st.lastRun ? (
                  <span className="shrink-0 font-mono text-[10.5px] text-[#e2d07a]" title="partial">
                    {st.lastRun.pass}/{st.lastRun.total}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={`flex shrink-0 items-center gap-2 ${hush ? "opacity-0" : ""}`}>
          <span
            role="timer"
            aria-live="off"
            className={`font-mono tabular-nums ${
              over ? "text-[14px] font-semibold text-[#ff8080]" : soon ? "text-[14px] font-semibold text-[#e6b455]" : "text-[13px] text-[#6f747c]"
            }`}
          >
            {over ? `+${mmss(-left)}` : mmss(left)}
            <span className="ml-1 text-[10.5px] font-normal text-[#5f646d]">{over ? "over" : "left"}</span>
          </span>
        </div>
        <button
          onClick={() => setHush((h) => !h)}
          aria-pressed={hush}
          aria-label={hush ? "Show the countdown digits" : "Hide the countdown digits"}
          title={hush ? "Show the digits again" : "Hide the digits, keep the bar"}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-[#8b929d] transition hover:bg-white/[0.06]"
        >
          {hush ? "◌" : "◍"}
        </button>
        <button onClick={() => setEndOpen(true)} className={`${btn} shrink-0 border border-[#33363d] text-[#dfe1e5]`}>
          End round
        </button>
      </header>

      {/* ---------------- the clock: a bar first, digits second ---------------- */}
      <div
        className={`relative h-2 w-full shrink-0 ${over ? "bg-[#2a1618]" : soon ? "bg-[#2c2a12]" : "bg-[#1a1c21]"}`}
        role="img"
        aria-label={`Time used, coloured by which problem you were on. ${over ? `${mmss(-left)} into overtime` : `${mmss(left)} left`}.`}
      >
        <div className="flex h-full">
          {merged.map((m, i) => (
            <i key={i} style={{ width: `${Math.min(100, (m.d / denom) * 100)}%`, background: PROBLEM_COLOR[m.p % 2] }} />
          ))}
        </div>
        {over && (
          <span
            className="absolute inset-y-0"
            style={{
              left: `${(durationSeconds / denom) * 100}%`,
              width: `${((elapsed - durationSeconds) / denom) * 100}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(236,91,91,.85) 0 3px, rgba(236,91,91,.25) 3px 7px)",
            }}
          />
        )}
        {/* one halfway tick, always there: the bar is a plan instrument */}
        <span className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${(durationSeconds / 2 / denom) * 100}%` }} />
        {durationSeconds > 900 && (
          <span
            className={`absolute inset-y-0 w-px ${soon || over ? "bg-[#e6b455]" : "bg-white/15"}`}
            style={{ left: `${((durationSeconds - 300) / denom) * 100}%` }}
          />
        )}
      </div>

      {/* ---------------- panes ---------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#24262b] bg-[#17181c]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
            <div className="flex gap-1">
              {([["statement", "Problem"], ...(P.kind === "sql" ? [["schema", "Schema & data"] as const] : []), ["scratch", "Scratchpad"]] as [typeof tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
                        className={`rounded-lg px-3 py-1.5 text-[12.5px] transition ${
                          tab === id ? "bg-white/[0.1] text-white" : "text-[#8b929d] hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
            <span
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-[#7f8794]"
              title="Hints and solutions are closed for this round"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              no hints · no solutions
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "statement" && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`rounded-md px-2 py-0.5 ${
                    P.difficulty === "easy" ? "bg-[#12331f] text-[#7fe0a2]"
                      : P.difficulty === "hard" ? "bg-[#331616] text-[#ff9d9d]" : "bg-[#2c2a12] text-[#e2d07a]"}`}>
                    {P.difficulty}
                  </span>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[#c8ccd4]">{P.kind === "sql" ? "SQL" : "Python"}</span>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[#8b929d]">~{P.minutes} min</span>
                </div>
                <h1 className="mb-3 text-[19px] font-semibold leading-snug">{P.title}</h1>
                <Markdown source={P.prompt} className="text-[13.5px] text-[#c8ccd4]" />
              </>
            )}

            {tab === "schema" && (
              <div>
                <p className="mb-3 text-[12.5px] text-[#8b929d]">
                  {tables.length} table{tables.length === 1 ? "" : "s"}, seeded and queryable in your browser.
                </p>
                {tables.map((t) => (
                  <div key={t.table} className="mb-4">
                    <p className="mb-1.5 text-[12.5px]">
                      <span className="font-mono text-[#4aa3ff]">{t.table}</span>{" "}
                      <span className="text-[#6b727e]">({t.total} row{t.total === 1 ? "" : "s"}{t.total > 8 ? ", first 8" : ""})</span>
                    </p>
                    <RowTable columns={t.columns} rows={t.rows} />
                  </div>
                ))}
              </div>
            )}

            {tab === "scratch" && (
              <textarea
                value={S.scratch}
                onChange={(e) => { store.current.lastKeyAt = store.current.elapsed; patch(cur, { scratch: e.target.value }); }}
                aria-label="Scratchpad"
                spellCheck={false}
                placeholder={"what does one row mean in each table?\n\nbrute force first, then the improvement\n…"}
                className="h-[420px] w-full resize-none rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3 font-mono text-[12.5px] leading-relaxed text-[#c8ccd4] outline-none focus:border-[#4aa3ff]"
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-[3] flex-col overflow-hidden rounded-xl border border-[#24262b] bg-[#17181c]">
            <div className="flex items-center justify-between border-b border-[#24262b] px-4 py-2.5">
              <span className="text-[12.5px] text-[#8b8f96]">{P.kind === "sql" ? "SQL" : "Python 3"}</span>
              <span className="text-[11.5px] text-[#6f747c]">{booting ? "starting engine…" : "runs in your browser"}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CodeEditor value={S.code} onChange={onCode} language={P.kind === "sql" ? "sql" : "python"} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#24262b] px-4 py-2.5">
              <div className="flex gap-2">
                <button onClick={run} disabled={!!busy || booting} className={`${btn} border border-[#33363d] text-[#dfe1e5]`}>
                  {busy === "run" ? "Running…" : "Run"}
                </button>
                <button onClick={submit} disabled={!!busy || booting} className={`${btn} bg-[#39c06c] text-[#07230f] hover:bg-[#43d179]`}>
                  {busy === "submit" ? "Checking…" : "Submit"}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={markDone} disabled={S.stopped} className={`${btn} border border-white/10 text-[#c8ccd4]`}>
                  Mark done &amp; move on
                </button>
                <button onClick={stopHere} disabled={S.stopped} className={`${btn} text-[#8b929d] hover:text-white`}>
                  Stop here
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-[2] flex-col overflow-hidden rounded-xl border border-[#24262b] bg-[#17181c]">
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
              <span className="text-[12.5px] text-[#8b929d]">
                {P.kind === "sql" ? "Your result" : `${P.sampleTests.length} sample · ${P.hiddenCount} hidden on submit`}
              </span>
              {S.banner && (
                <span role="status" className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                  S.banner.tone === "ok" ? "bg-[#12331f] text-[#7fe0a2]" : "bg-[#2a1618] text-[#ffa1a1]"}`}>
                  {S.banner.text}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {P.kind === "sql" ? (
                S.sqlOut ? (
                  S.sqlOut.ok ? <RowTable columns={S.sqlOut.columns} rows={S.sqlOut.rows} /> : (
                    <pre className="rounded-lg border border-[#5c2b2b] bg-[#2a1618] p-3 font-mono text-[12px] whitespace-pre-wrap text-[#ff9d9d]">
                      {S.sqlOut.error}
                    </pre>
                  )
                ) : (
                  <p className="text-[13px] leading-relaxed text-[#8b929d]">
                    <span className="text-[#c8ccd4]">Run</span> executes your query against a real SQLite database in this
                    tab. <span className="text-[#c8ccd4]">Submit</span> compares your rows against a reference query kept
                    on the server.
                  </p>
                )
              ) : S.results ? (
                <ul className="space-y-1.5">
                  {S.results.map((r, n) => (
                    <li key={n} className={`rounded-lg border-l-2 bg-white/[0.03] px-3 py-2 text-[12.5px] ${
                      r.passed ? "border-[#39c06c]" : "border-[#ec5b5b]"}`}>
                      <div className="flex justify-between">
                        <span>Test {n + 1}{r.sample ? " (sample)" : ""}</span>
                        <span className={r.passed ? "text-[#7fe0a2]" : "text-[#ff9d9d]"}>{r.passed ? "Passed" : "Failed"}</span>
                      </div>
                      {!r.passed && (
                        <div className="mt-1 font-mono text-[11.5px] text-[#8b929d]">
                          <div>in: {String(r.input)}</div>
                          {r.expected !== null && <div>expected: {JSON.stringify(r.expected)}</div>}
                          <div>got: {r.error ? r.error : JSON.stringify(r.got)}</div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] leading-relaxed text-[#8b929d]">
                  <span className="text-[#c8ccd4]">Run</span> checks the samples in this tab.{" "}
                  <span className="text-[#c8ccd4]">Submit</span> runs the hidden set too and is what decides whether it
                  counts as solved. There is no trace, no hint and no solution in a round — that is the point of one.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {nudge && (
        <div role="status" className="fixed bottom-5 right-5 z-40 max-w-xs rounded-xl border border-[#4a4520] bg-[#231f10] px-4 py-3 shadow-2xl">
          <p className="text-[12.5px] leading-relaxed text-[#e2d07a]">
            Forty-five seconds of nothing. If this were the real round, would they know what you are thinking?
          </p>
          <button onClick={() => { setNudge(false); store.current.nudgeOn = false; }}
                  className="mt-2 text-[11.5px] text-[#c9a94a] underline underline-offset-2">
            Stop nudging me
          </button>
        </div>
      )}

      {endOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-labelledby="endTitle">
          <div className="w-full max-w-md rounded-2xl border border-[#24262b] bg-[#17181c] p-6">
            <h3 id="endTitle" className="text-[17px] font-semibold">End the round?</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#9aa1ad]">
              {left > 0 ? <>You have <b className="font-mono text-[#c8ccd4]">{mmss(left)}</b> left</>
                : <>You are <b className="font-mono text-[#c8ccd4]">{mmss(-left)}</b> into overtime</>}
              {openCount ? <> and {openCount === 1 ? "one problem" : `${openCount} problems`} still open.</> : <> and nothing still open.</>}{" "}
              Ending now is completely fine — an honest short round tells you more than a padded long one. Everything
              you have done is scored either way.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEndOpen(false)} className={`${btn} text-[#9aa1ad] hover:text-white`}>Keep going</button>
              <button onClick={endRound} disabled={ending}
                      className={`${btn} bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] font-semibold text-[#0b0c0f]`}>
                {ending ? "Scoring…" : "End and score it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
