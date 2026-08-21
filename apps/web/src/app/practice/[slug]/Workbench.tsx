"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEngine, type ResultRow, type TestCase, type TraceResult,
} from "@/lib/engine-client";

type Entitlements = { pro: boolean; gems: number; hintsLeft: number; solutionsLeft: number };

export function Workbench(props: {
  slug: string; title: string; difficulty: string; pattern: string; minutes: number;
  prompt: string; followups: string[]; hintCount: number; starter: string; func: string;
  sampleTests: TestCase[]; hiddenCount: number; entitlements: Entitlements;
}) {
  const [code, setCode] = useState(props.starter);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState<null | string>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useState<string[]>([]);
  const [expr, setExpr] = useState("");
  const [replLog, setReplLog] = useState<{ q: string; a: string; bad?: boolean }[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [ent, setEnt] = useState(props.entitlements);
  const engine = useRef(getEngine());

  useEffect(() => {
    let alive = true;
    engine.current.warm().then(() => alive && setBooting(false)).catch(() => alive && setBooting(false));
    return () => { alive = false; };
  }, []);

  const guard = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); }
    catch (e) { setBanner({ tone: "bad", text: (e as Error).message }); }
    finally { setBusy(null); }
  }, [busy]);

  /* --- run sample tests in the browser -------------------------------- */
  const runSamples = () => guard("run", async () => {
    setTrace(null);
    const { results } = await engine.current.run(code, props.sampleTests, "function", props.func);
    setResults(results);
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
    setTrace(t); setStep(0); setPinned([]); setReplLog([]);
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
    <main className="min-h-screen bg-[#0f1013] text-[#dfe1e5]">
      <header className="flex items-center justify-between border-b border-[#24262b] px-5 py-3">
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

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* problem */}
        <section className={`${card} p-5`}>
          <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#c8ccd2]">{props.prompt}</div>

          {hints.map((h, i) => (
            <p key={i} className="mt-3 rounded-lg border border-[#4a4520] bg-[#231f10] px-3 py-2 text-[12.5px] text-[#e2d07a]">
              Hint {i + 1}: {h}
            </p>
          ))}

          <div className="mt-4 flex gap-2">
            <button onClick={getHint} disabled={!!busy || hints.length >= props.hintCount}
                    className={`${btn} border border-[#33363d] text-[#a9adb5] hover:text-[#dfe1e5]`}>
              {hints.length >= props.hintCount ? "No more hints" : `Hint (${hints.length}/${props.hintCount})`}
            </button>
          </div>

          {props.followups.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-[13px] text-[#4aa3ff]">Follow-ups an interviewer may ask</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-[#a9adb5]">
                {props.followups.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </details>
          )}
        </section>

        {/* editor + results */}
        <section className="flex flex-col gap-4">
          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[#24262b] px-4 py-2.5">
              <span className="text-[12.5px] text-[#8b8f96]">Python 3</span>
              <span className="text-[11.5px] text-[#6f747c]">
                {booting ? "starting engine…" : "runs in your browser"}
              </span>
            </div>
            <textarea
              value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
              className="h-[300px] w-full resize-y bg-[#101115] p-4 font-mono text-[13px] leading-relaxed text-[#dfe1e5] outline-none"
              aria-label="Code editor"
            />
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
              <button onClick={submit} disabled={!!busy || booting}
                      className={`${btn} bg-[#39c06c] text-[#07230f] hover:bg-[#43d179]`}>
                {busy === "submit" ? "Checking…" : "Submit"}
              </button>
            </div>
          </div>

          {banner && (
            <div role="status" className={`rounded-lg px-4 py-2.5 text-[13px] font-medium ${
              banner.tone === "ok" ? "bg-[#12331f] text-[#7fe0a2]" : "bg-[#2a1618] text-[#ffa1a1]"}`}>
              {banner.text}
            </div>
          )}

          {/* stepper */}
          {trace && cur && (
            <div className={`${card} p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
                        className={`${btn} border border-[#33363d]`} aria-label="Previous step">◀</button>
                <button onClick={() => setStep((s) => Math.min(trace.steps.length - 1, s + 1))}
                        disabled={step >= trace.steps.length - 1}
                        className={`${btn} border border-[#33363d]`} aria-label="Next step">▶</button>
                <input type="range" min={0} max={trace.steps.length - 1} value={step}
                       onChange={(e) => setStep(Number(e.target.value))}
                       className="flex-1 accent-[#39c06c]" aria-label="Step" />
                <span className="font-mono text-[11.5px] text-[#8b8f96]">
                  {step + 1} / {trace.steps.length}
                </span>
              </div>

              <p className="mt-3 text-[13px] text-[#39c06c]">{narrate()}</p>
              <p className="mt-1 font-mono text-[12px] text-[#8b8f96]">
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
                                : "border-[#3a3d42] bg-[#1d1f24]"}`}>
                    <span className="text-[#4aa3ff]">{n}</span>{" "}
                    <span className="text-[#dfe1e5]">{trace.pool[cur.locals[n]]?.s}</span>
                  </button>
                ))}
              </div>

              {pinned.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {pinned.map((n) => {
                    const v = valueOf(n);
                    return (
                      <div key={n} className="rounded-lg border border-[#4aa3ff] bg-[#17181c]">
                        <div className="flex justify-between border-b border-[#24262b] bg-[#16283a] px-3 py-1.5 font-mono text-[11.5px]">
                          <span className="text-[#4aa3ff]">{n}</span>
                          <span className="text-[#8b8f96]">{v?.t}{v?.n != null ? ` · ${v.n}` : ""}</span>
                        </div>
                        <pre className="max-h-40 overflow-auto p-3 font-mono text-[11.5px]">
                          {v?.p ?? "not in scope here"}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 border-t border-[#24262b] pt-3">
                {replLog.map((r, i) => (
                  <div key={i} className="mb-2 font-mono text-[11.5px]">
                    <div className="text-[#4aa3ff]">&gt;&gt;&gt; {r.q}</div>
                    <div className={r.bad ? "text-[#ec5b5b]" : "text-[#dfe1e5]"}>{r.a}</div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-[#39c06c]">&gt;&gt;&gt;</span>
                  <input value={expr} onChange={(e) => setExpr(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); evalExpr(); } }}
                         placeholder="evaluate an expression at this step"
                         aria-label="Expression console"
                         className="flex-1 rounded-lg border border-[#33363d] bg-[#101115] px-3 py-1.5 font-mono text-[12px] outline-none focus:border-[#4aa3ff]" />
                </div>
              </div>
            </div>
          )}

          {/* results */}
          {results && (
            <div className={`${card} p-4`}>
              <p className="mb-2 text-[12px] text-[#8b8f96]">
                {props.hiddenCount} hidden test{props.hiddenCount === 1 ? "" : "s"} run on submit
              </p>
              <ul className="space-y-1.5">
                {results.map((r, i) => (
                  <li key={i} className={`rounded-lg border-l-2 bg-[#1d1f24] px-3 py-2 text-[12.5px] ${
                        r.passed ? "border-[#39c06c]" : "border-[#ec5b5b]"}`}>
                    <div className="flex justify-between">
                      <span>Test {i + 1}{r.sample ? " (sample)" : ""}</span>
                      <span className={r.passed ? "text-[#39c06c]" : "text-[#ec5b5b]"}>
                        {r.passed ? "Passed" : "Failed"}
                      </span>
                    </div>
                    {!r.passed && (
                      <div className="mt-1 font-mono text-[11.5px] text-[#8b8f96]">
                        <div>in: {String(r.input)}</div>
                        <div>expected: {JSON.stringify(r.expected)}</div>
                        <div>got: {r.error ? r.error : JSON.stringify(r.got)}</div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
