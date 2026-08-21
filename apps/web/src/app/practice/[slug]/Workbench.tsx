"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { previewTables, runQuery, type SqlResult } from "@/lib/sql-client";
import { Markdown } from "@/components/Markdown";
import {
  getEngine, type ResultRow, type TestCase, type TraceResult,
} from "@/lib/engine-client";

type ProblemTab = "description" | "schema" | "hints" | "solution";

function RowTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  if (!columns.length) return <p className="text-[12.5px] text-[#8b929d]">No columns returned.</p>;
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-white/[0.08]">
      <table className="w-full border-collapse font-mono text-[11.5px]">
        <thead className="sticky top-0 bg-white/[0.06]">
          <tr>
            {columns.map((c) => (
              <th key={c} className="border-b border-white/[0.08] px-2.5 py-1.5 text-left font-medium text-[#c8ccd4]">
                {c}
              </th>
            ))}
          </tr>
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
      {rows.length === 0 && (
        <p className="px-2.5 py-3 text-[12px] text-[#8b929d]">No rows.</p>
      )}
    </div>
  );
}

type Entitlements = { pro: boolean; gems: number; hintsLeft: number; solutionsLeft: number };

export function Workbench(props: {
  slug: string; title: string; difficulty: string; pattern: string; minutes: number;
  prompt: string; followups: string[]; hintCount: number; starter: string; func: string;
  sampleTests: TestCase[]; hiddenCount: number; entitlements: Entitlements;
  kind: "code" | "sql"; sqlSchema: string; sqlSeed: string; sqlOrdered: boolean;
}) {
  const isSql = props.kind === "sql";
  const [code, setCode] = useState(props.starter);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState<null | string>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useState<string[]>([]);
  const [tab, setTab] = useState<"results" | "trace">("results");
  const [pTab, setPTab] = useState<ProblemTab>("description");
  const [solution, setSolution] = useState<{ code: string; explanation: string } | null>(null);
  const [solutionCost, setSolutionCost] = useState<string | null>(null);
  const [sqlOut, setSqlOut] = useState<SqlResult | null>(null);
  const [tables, setTables] = useState<Awaited<ReturnType<typeof previewTables>>>([]);
  const [expr, setExpr] = useState("");
  const [replLog, setReplLog] = useState<{ q: string; a: string; bad?: boolean }[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [ent, setEnt] = useState(props.entitlements);
  const engine = useRef(getEngine());

  useEffect(() => {
    let alive = true;
    if (isSql) {
      previewTables(props.sqlSchema, props.sqlSeed)
        .then((t) => { if (alive) { setTables(t); setBooting(false); } })
        .catch(() => alive && setBooting(false));
    } else {
      engine.current.warm()
        .then(() => alive && setBooting(false))
        .catch(() => alive && setBooting(false));
    }
    return () => { alive = false; };
  }, [isSql, props.sqlSchema, props.sqlSeed]);

  const guard = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); }
    catch (e) { setBanner({ tone: "bad", text: (e as Error).message }); }
    finally { setBusy(null); }
  }, [busy]);

  /* --- SQL: run here, judged against a reference query we never send ---- */
  const runSql = () => guard("run", async () => {
    setTrace(null);
    const out = await runQuery(props.sqlSchema, props.sqlSeed, code);
    setSqlOut(out); setTab("results");
    setBanner(out.ok
      ? { tone: "ok", text: `${out.rows.length} row${out.rows.length === 1 ? "" : "s"} returned` }
      : { tone: "bad", text: out.error });
  });

  const submitSql = () => guard("submit", async () => {
    const out = await runQuery(props.sqlSchema, props.sqlSeed, code);
    setSqlOut(out); setTab("results");
    if (!out.ok) { setBanner({ tone: "bad", text: out.error }); return; }
    const res = await fetch(`/api/problems/${props.slug}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "sql", code, outputs: [],
                             sqlRows: { columns: out.columns, rows: out.rows } }),
    });
    const data = await res.json();
    if (!res.ok) { setBanner({ tone: "bad", text: data.error ?? "Submit failed." }); return; }
    const solved = data.status === "solved";
    const awarded = data.gems?.awarded ?? 0;
    setBanner({
      tone: solved ? "ok" : "bad",
      text: solved
        ? `Solved${awarded ? ` · +${awarded} gems` : ""}`
        : (data.sqlMessage ?? "Not quite."),
    });
    if (data.entitlements) setEnt((e) => ({ ...e, gems: data.entitlements.gems ?? e.gems }));
  });

  /* --- run sample tests in the browser -------------------------------- */
  const runSamples = () => guard("run", async () => {
    setTrace(null);
    const { results } = await engine.current.run(code, props.sampleTests, "function", props.func);
    setResults(results); setTab("results");
    const passed = results.filter((r) => r.passed).length;
    setBanner({
      tone: passed === results.length ? "ok" : "bad",
      text: `Sample tests: ${passed}/${results.length} passed`,
    });
  });

  /* --- submit ---------------------------------------------------------
   * Two phases on purpose. The server hands over test INPUTS only, the code
   * runs here, and the server compares the outputs against expected values it
   * never disclosed. So user code still never touches our infrastructure, and
   * a client cannot fake a pass without actually computing the right answers.
   */
  const submit = () => guard("submit", async () => {
    setTrace(null);
    const started = Date.now();
    const tRes = await fetch(`/api/problems/${props.slug}/tests`);
    if (!tRes.ok) { setBanner({ tone: "bad", text: "Could not load the tests." }); return; }
    const { tests } = (await tRes.json()) as { tests: (TestCase & { index: number })[] };

    const { results: local } = await engine.current.run(code, tests, "function", props.func);
    // Send the values produced, never a verdict: the server decides.
    const outputs = local.map((r, i) => (
      r.error
        ? { index: tests[i]?.index ?? i, ok: false, error: r.error }
        : { index: tests[i]?.index ?? i, ok: true, value: r.got }
    ));

    const res = await fetch(`/api/problems/${props.slug}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language: "python", outputs, durationMs: Date.now() - started }),
    });
    const data = await res.json();
    if (!res.ok) { setBanner({ tone: "bad", text: data.error ?? "Submit failed." }); return; }
    const solved = data.status === "solved";
    const awarded = data.gems?.awarded ?? 0;
    setResults((data.results ?? []).map((r: { index: number; passed: boolean; sample: boolean }) => ({
      input: `test ${r.index + 1}`, expected: null, got: null,
      passed: r.passed, error: "", sample: r.sample, index: r.index,
    })));
    setBanner({
      tone: solved ? "ok" : "bad",
      text: solved
        ? `Solved — ${data.testsPassed}/${data.testsTotal} tests${awarded ? ` · +${awarded} gems` : ""}`
        : `${data.testsPassed}/${data.testsTotal} tests passed`,
    });
    if (data.entitlements) {
      setEnt((e) => ({ ...e, gems: data.entitlements.gems ?? e.gems }));
    }
  });

  /* --- trace ---------------------------------------------------------- */
  const runTrace = () => guard("trace", async () => {
    const t = await engine.current.trace(code, props.sampleTests[0] ?? {}, "function", props.func);
    if (!t.steps?.length) {
      setBanner({ tone: "bad", text: t.error || "Nothing to trace — is the function written?" });
      return;
    }
    setTrace(t); setStep(0); setPinned([]); setReplLog([]); setTab("trace");
    setBanner(null);
  });

  const evalExpr = () => guard("eval", async () => {
    if (!expr.trim() || !trace) return;
    const r = await engine.current.evalAt(code, props.sampleTests[0] ?? {}, step, expr, "function", props.func);
    setReplLog((l) => [...l, r.error ? { q: expr, a: r.error, bad: true } : { q: expr, a: r.repr ?? "" }]);
    setExpr("");
  });

  /* --- metered hint --------------------------------------------------- */
  const getHint = () => guard("hint", async () => {
    const res = await fetch(`/api/problems/${props.slug}/hint`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: hints.length }),
    });
    const data = await res.json();
    if (res.status === 402) {
      setBanner({ tone: "bad", text: data.error ?? "You are out of hints for today." });
      return;
    }
    if (!res.ok) { setBanner({ tone: "bad", text: data.error ?? "Could not fetch a hint." }); return; }
    setHints((h) => [...h, data.hint]);
    if (data.entitlements) setEnt(data.entitlements);
  });

  /* --- metered solution -------------------------------------------------- */
  const getSolution = () => guard("solution", async () => {
    const res = await fetch(`/api/problems/${props.slug}/solution`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "python" }),
    });
    const data = await res.json();
    if (res.status === 402) { setSolutionCost(data.error ?? "You are out of solutions today."); return; }
    if (!res.ok) { setSolutionCost(data.error ?? "Could not fetch the solution."); return; }
    setSolution({
      code: data.solution ?? data.code ?? "",
      explanation: data.explanation ?? "",
    });
    if (data.entitlements) setEnt(data.entitlements);
  });

  const cur = trace?.steps[step];
  const valueOf = (name: string) => trace?.pool[cur?.locals[name] ?? -1];

  /* --- narration: what the previous line accomplished ------------------ */
  const narrate = () => {
    if (!trace || !cur) return "";
    if (step === 0) return "The function was called. Nothing else has run yet.";
    const prev = trace.steps[step - 1];
    const psrc = (trace.source[prev.line - 1] ?? "").trim();
    const vals = cur.changed.map((n) => `${n} = ${trace.pool[cur.locals[n]]?.s}`).join(", ");
    if (prev.returned !== undefined && prev.fid !== cur.fid)
      return `${prev.func}() returned ${prev.returned}, so we are back in ${cur.func}().`;
    if (prev.line === cur.line) return vals ? `Line ${prev.line} is iterating: ${vals}.` : `Line ${prev.line} ran again.`;
    if (/^for\b/.test(psrc)) return vals ? `The loop on line ${prev.line} handed out: ${vals}.` : `The loop on line ${prev.line} ended.`;
    if (/^(if|elif|while)\b/.test(psrc)) {
      const indent = (s: string) => (s.match(/^\s*/) ?? [""])[0].length;
      const took = indent(trace.source[cur.line - 1] ?? "") > indent(trace.source[prev.line - 1] ?? "");
      return `The condition on line ${prev.line} was ${took ? "true" : "false"}, so we ${took ? "entered" : "skipped"} its block.`;
    }
    return vals ? `Line ${prev.line} set ${vals}.` : `Line ${prev.line} ran without changing anything.`;
  };

  const card = "rounded-xl border border-[#24262b] bg-[#17181c]";
  const btn = "rounded-lg px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#0b0c0f] text-[#e6e8ec]">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <div className="flex items-baseline gap-3">
          <a href="/dashboard" className="text-[13px] text-[#8b8f96] hover:text-[#dfe1e5]">&larr;</a>
          <h1 className="text-[15px] font-semibold">{props.title}</h1>
          <span className="text-[12px] text-[#6f747c]">
            {props.difficulty} · {props.pattern} · {props.minutes} min
          </span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[#8b8f96]">
          <span>{ent.pro ? "Pro" : `${ent.hintsLeft} hints left`}</span>
          <span className="rounded-full border border-[#3a3d42] px-2.5 py-1">{ent.gems} gems</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* problem */}
        <section className={`${card} flex min-h-0 flex-col overflow-hidden`}>
          <div className="flex shrink-0 gap-1 border-b border-white/[0.07] px-3 py-2">
            {([
              ["description", "Description"],
              ...(isSql ? [["schema", "Schema & data"] as const] : []),
              ["hints", `Hints ${hints.length}/${props.hintCount}`],
              ["solution", "Solution"],
            ] as [ProblemTab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPTab(id)}
                aria-pressed={pTab === id}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] transition ${
                  pTab === id ? "bg-white/[0.1] text-white" : "text-[#8b929d] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {pTab === "description" && (
              <>
                <Markdown source={props.prompt} className="text-[13.5px] text-[#c8ccd4]" />
                {props.followups.length > 0 && (
                  <details className="mt-5">
                    <summary className="cursor-pointer text-[13px] text-[#4aa3ff]">
                      Follow-ups an interviewer may ask
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-[#9aa1ad]">
                      {props.followups.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}

            {pTab === "schema" && (
              <div>
                <p className="mb-3 text-[12.5px] text-[#8b929d]">
                  {tables.length} table{tables.length === 1 ? "" : "s"}, seeded and queryable in your browser.
                </p>
                {tables.map((t) => (
                  <div key={t.table} className="mb-4">
                    <p className="mb-1.5 text-[12.5px]">
                      <span className="font-mono text-[#4aa3ff]">{t.table}</span>{" "}
                      <span className="text-[#6b727e]">
                        ({t.total} row{t.total === 1 ? "" : "s"}{t.total > 8 ? ", first 8" : ""})
                      </span>
                    </p>
                    <RowTable columns={t.columns} rows={t.rows} />
                  </div>
                ))}
                <details className="mt-4">
                  <summary className="cursor-pointer text-[12.5px] text-[#4aa3ff]">CREATE TABLE statements</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3 font-mono text-[11.5px] text-[#c8ccd4]">
                    {props.sqlSchema.trim()}
                  </pre>
                </details>
              </div>
            )}

            {pTab === "hints" && (
              <div>
                {hints.length === 0 && (
                  <p className="text-[13px] leading-relaxed text-[#8b929d]">
                    Three hints, each a bit more direct than the last. Try the trace first —
                    it usually tells you more than hint one does.
                  </p>
                )}
                {hints.map((h, i) => (
                  <div key={i} className="mb-2.5 rounded-lg border border-[#4a4520] bg-[#231f10] px-3.5 py-2.5">
                    <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-[#c9a94a]">
                      Hint {i + 1}
                    </p>
                    <p className="text-[13px] leading-relaxed text-[#e2d07a]">{h}</p>
                  </div>
                ))}
                <button
                  onClick={getHint}
                  disabled={!!busy || hints.length >= props.hintCount}
                  className={`${btn} mt-3 border border-white/12 text-[#c8ccd4]`}
                >
                  {hints.length >= props.hintCount
                    ? "No more hints"
                    : busy === "hint"
                      ? "Getting…"
                      : `Reveal hint ${hints.length + 1}`}
                </button>
                <p className="mt-2 text-[11.5px] text-[#6b727e]">
                  {ent.pro
                    ? "Pro — unlimited"
                    : ent.hintsLeft > 0
                      ? `${ent.hintsLeft} free hints left today, then 1 gem each`
                      : `Free hints used — 1 gem each · ${ent.gems} gems`}
                </p>
              </div>
            )}

            {pTab === "solution" && (
              <div>
                {solution ? (
                  <>
                    <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3.5 font-mono text-[12px] leading-relaxed text-[#c8ccd4]">
                      {solution.code}
                    </pre>
                    {solution.explanation && (
                      <Markdown source={solution.explanation} className="mt-4 text-[13px] text-[#c8ccd4]" />
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed text-[#8b929d]">
                      The reference solution and the write-up explaining why it works.
                      Worth spending five more minutes before you look — the explanation
                      lands harder when you have already fought the problem.
                    </p>
                    {solutionCost && (
                      <p role="alert" className="mt-3 rounded-lg border border-[#5c2b2b] bg-[#2a1618] px-3 py-2 text-[12.5px] text-[#ff9d9d]">
                        {solutionCost}
                      </p>
                    )}
                    <button
                      onClick={getSolution}
                      disabled={!!busy}
                      className={`${btn} mt-4 border border-white/12 text-[#c8ccd4]`}
                    >
                      {busy === "solution" ? "Revealing…" : "Reveal the solution"}
                    </button>
                    <p className="mt-2 text-[11.5px] text-[#6b727e]">
                      {ent.pro
                        ? "Pro — unlimited"
                        : ent.solutionsLeft > 0
                          ? `${ent.solutionsLeft} free solutions left today, then 3 gems`
                          : `Free solutions used — 3 gems · ${ent.gems} gems`}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* editor + results */}
        <section className="flex min-h-0 flex-col gap-4">
          <div className={`${card} flex min-h-0 flex-[3] flex-col overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[#24262b] px-4 py-2.5">
              <span className="text-[12.5px] text-[#8b8f96]">Python 3</span>
              <span className="text-[11.5px] text-[#6f747c]">
                {booting ? "starting engine…" : "runs in your browser"}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CodeEditor value={code} onChange={setCode} language={isSql ? "sql" : "python"} />
            </div>
            <div className="flex items-center justify-between border-t border-[#24262b] px-4 py-2.5">
              <div className="flex gap-2">
                <button onClick={runTrace} disabled={!!busy || booting}
                        className={`${btn} border border-[#33363d] text-[#dfe1e5]`}>
                  {busy === "trace" ? "Tracing…" : "Trace"}
                </button>
                <button onClick={runSamples} disabled={!!busy || booting}
                        className={`${btn} border border-[#33363d] text-[#dfe1e5]`}>
                  {busy === "run" ? "Running…" : "Run"}
                </button>
              </div>
              <button onClick={isSql ? submitSql : submit} disabled={!!busy || booting}
                      className={`${btn} bg-[#39c06c] text-[#07230f] hover:bg-[#43d179]`}>
                {busy === "submit" ? "Checking…" : "Submit"}
              </button>
            </div>
          </div>

          <div className={`${card} flex min-h-0 flex-[2] flex-col overflow-hidden`}>
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
              <div className="flex gap-1">
                {(["results", "trace"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    aria-pressed={tab === t}
                    className={`rounded-lg px-3 py-1 text-[12.5px] transition ${
                      tab === t ? "bg-white/[0.1] text-white" : "text-[#8b929d] hover:text-white"
                    }`}
                  >
                    {t === "results" ? "Test cases" : "Trace"}
                  </button>
                ))}
              </div>
              {banner && (
                <span
                  role="status"
                  className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                    banner.tone === "ok" ? "bg-[#12331f] text-[#7fe0a2]" : "bg-[#2a1618] text-[#ffa1a1]"
                  }`}
                >
                  {banner.text}
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === "trace" ? (
                trace && cur ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
                              className={`${btn} border border-white/12`} aria-label="Previous step">◀</button>
                      <button onClick={() => setStep((s) => Math.min(trace.steps.length - 1, s + 1))}
                              disabled={step >= trace.steps.length - 1}
                              className={`${btn} border border-white/12`} aria-label="Next step">▶</button>
                      <input type="range" min={0} max={trace.steps.length - 1} value={step}
                             onChange={(e) => setStep(Number(e.target.value))}
                             className="flex-1 accent-[#00E5FF]" aria-label="Step" />
                      <span className="font-mono text-[11.5px] text-[#8b929d]">
                        {step + 1} / {trace.steps.length}
                      </span>
                    </div>

                    <p className="mt-3 text-[13px] leading-relaxed text-[#00E5FF]">{narrate()}</p>
                    <p className="mt-1 font-mono text-[12px] text-[#8b929d]">
                      line {cur.line}: {(trace.source[cur.line - 1] ?? "").trim()}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.keys(cur.locals).sort().map((n) => (
                        <button key={n} onClick={() => setPinned((p) =>
                                  p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
                                className={`rounded-full border px-3 py-1 font-mono text-[11.5px] ${
                                  cur.changed.includes(n)
                                    ? "border-[#2f6b45] bg-[#12331f]"
                                    : pinned.includes(n)
                                      ? "border-[#4aa3ff] bg-[#16283a]"
                                      : "border-white/12 bg-white/[0.03]"}`}>
                          <span className="text-[#4aa3ff]">{n}</span>{" "}
                          <span>{trace.pool[cur.locals[n]]?.s}</span>
                        </button>
                      ))}
                    </div>

                    {pinned.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {pinned.map((n) => {
                          const v = valueOf(n);
                          return (
                            <div key={n} className="overflow-hidden rounded-lg border border-[#4aa3ff]/60">
                              <div className="flex justify-between bg-[#16283a] px-3 py-1.5 font-mono text-[11.5px]">
                                <span className="text-[#4aa3ff]">{n}</span>
                                <span className="text-[#8b929d]">{v?.t}{v?.n != null ? ` · ${v.n}` : ""}</span>
                              </div>
                              <pre className="max-h-32 overflow-auto p-3 font-mono text-[11.5px]">
                                {v?.p ?? "not in scope here"}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 border-t border-white/[0.07] pt-3">
                      {replLog.map((r, n) => (
                        <div key={n} className="mb-2 font-mono text-[11.5px]">
                          <div className="text-[#4aa3ff]">&gt;&gt;&gt; {r.q}</div>
                          <div className={r.bad ? "text-[#ff9d9d]" : "text-[#e6e8ec]"}>{r.a}</div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-bold text-[#39c06c]">&gt;&gt;&gt;</span>
                        <input value={expr} onChange={(e) => setExpr(e.target.value)}
                               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); evalExpr(); } }}
                               placeholder="evaluate an expression at this step, e.g. seen"
                               aria-label="Expression console"
                               className="flex-1 rounded-lg border border-white/12 bg-[#0b0c0f] px-3 py-1.5 font-mono text-[12px] outline-none focus:border-[#4aa3ff]" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div className="max-w-sm">
                      <p className="text-[14px] font-medium text-[#c8ccd4]">Step through what your code did</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-[#8b929d]">
                        Trace runs your code one line at a time and shows every variable as it
                        changes. It works on a half-finished attempt, so you do not need a
                        correct answer first.
                      </p>
                      <button onClick={runTrace} disabled={!!busy || booting}
                              className={`${btn} mt-4 border border-white/12 text-[#e6e8ec]`}>
                        {busy === "trace" ? "Tracing…" : "Trace this problem"}
                      </button>
                    </div>
                  </div>
                )
              ) : isSql ? (
                sqlOut ? (
                  sqlOut.ok ? (
                    <>
                      <p className="mb-2 text-[12px] text-[#8b929d]">
                        Your result · {sqlOut.rows.length} row{sqlOut.rows.length === 1 ? "" : "s"}
                      </p>
                      <RowTable columns={sqlOut.columns} rows={sqlOut.rows} />
                    </>
                  ) : (
                    <pre className="rounded-lg border border-[#5c2b2b] bg-[#2a1618] p-3 font-mono text-[12px] text-[#ff9d9d]">
                      {sqlOut.error}
                    </pre>
                  )
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div className="max-w-sm">
                      <p className="text-[14px] font-medium text-[#c8ccd4]">Run your query</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-[#8b929d]">
                        It runs against a real SQLite database in your browser.{" "}
                        <span className="text-[#c8ccd4]">Submit</span> compares your rows
                        against a reference query kept on the server.
                      </p>
                    </div>
                  </div>
                )
              ) : results ? (
                <>
                  <p className="mb-2 text-[12px] text-[#8b929d]">
                    {props.hiddenCount} hidden test{props.hiddenCount === 1 ? "" : "s"} run on submit
                  </p>
                  <ul className="space-y-1.5">
                    {results.map((r, n) => (
                      <li key={n} className={`rounded-lg border-l-2 bg-white/[0.03] px-3 py-2 text-[12.5px] ${
                            r.passed ? "border-[#39c06c]" : "border-[#ec5b5b]"}`}>
                        <div className="flex justify-between">
                          <span>Test {n + 1}{r.sample ? " (sample)" : ""}</span>
                          <span className={r.passed ? "text-[#7fe0a2]" : "text-[#ff9d9d]"}>
                            {r.passed ? "Passed" : "Failed"}
                          </span>
                        </div>
                        {!r.passed && (
                          <div className="mt-1 font-mono text-[11.5px] text-[#8b929d]">
                            <div>in: {String(r.input)}</div>
                            {r.expected !== null && <div>expected: {JSON.stringify(r.expected)}</div>}
                            <div>got: {r.error ? r.error : JSON.stringify(r.got)}</div>
                          </div>
                        )}
                        {!r.passed && (
                          <button onClick={runTrace} disabled={!!busy}
                                  className="mt-2 rounded-md border border-white/12 px-2.5 py-1 text-[11.5px] text-[#c8ccd4] hover:bg-white/[0.06]">
                            Trace this case
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="grid h-full place-items-center text-center">
                  <div className="max-w-sm">
                    <p className="text-[14px] font-medium text-[#c8ccd4]">
                      {props.sampleTests.length} sample case{props.sampleTests.length === 1 ? "" : "s"},{" "}
                      {props.hiddenCount} hidden
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#8b929d]">
                      <span className="text-[#c8ccd4]">Run</span> checks the samples in your browser.{" "}
                      <span className="text-[#c8ccd4]">Submit</span> runs the hidden set too and
                      records the attempt. Stuck? <span className="text-[#c8ccd4]">Trace</span> steps
                      through what actually happened.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
