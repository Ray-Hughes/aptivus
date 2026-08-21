"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { getEngine, type ResultRow, type TestCase } from "@/lib/engine-client";
import { getJsEngine } from "@/lib/js-client";

/**
 * Read on the left, write on the right, and never more than a few seconds
 * between the two. The failure mode of every language tutorial is the reader
 * nodding along to prose they cannot yet act on, so the exercise is always
 * on screen next to the explanation rather than at the end of it.
 */

type PublicLesson = {
  adapted: { pace: string; summary: string; basedOn: number } | null;
  title: string;
  relevance: string;
  estimatedMinutes: number;
  teaching: string;
  func: string;
  scaffold: string;
  hintCount: number;
  hints: string[];
  solution: string | null;
  tests: { args: unknown[]; expected: unknown; sample: boolean }[];
};

type Loaded = {
  lesson: PublicLesson;
  progress: { status: string; code: string | null; hintsUsed: number; solutionRevealed: boolean };
};

type Panel = "hints" | "ask" | "solution";

export function LessonPlayer(props: {
  trackId: string; lessonId: string;
  title: string; relevance: string; position: number; total: number;
  nextId: string | null;
  language: string; languageLabel: string; knownLabel: string; jobTitle: string;
  pro: boolean; gems: number;
}) {
  const { trackId, lessonId, language } = props;

  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [code, setCode] = useState("");

  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const [panel, setPanel] = useState<Panel>("hints");
  const [hints, setHints] = useState<string[]>([]);
  const [solution, setSolution] = useState<string | null>(null);
  const [busyUnlock, setBusyUnlock] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);

  // The autosave and Ask both need the CURRENT code from inside a callback
  // that was created earlier. Mirrored in an effect rather than assigned during
  // render, which React 19 rightly treats as a bug.
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);

  /* ---------------------------------------------------------------- */
  /* load - this is where a never-opened lesson gets written           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tracks/${trackId}/lessons/${lessonId}`, { method: "POST" });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setLoadError(body.error ?? "Could not load this lesson.");
          setState("failed");
          return;
        }
        const loaded = body as Loaded;
        setData(loaded);
        setCode(loaded.progress.code ?? loaded.lesson.scaffold);
        setHints(loaded.lesson.hints);
        setSolution(loaded.lesson.solution);
        setComplete(loaded.progress.status === "complete");
        setState("ready");
        // Warm the runtime while they are still reading the first paragraph.
        if (language === "python") void getEngine().warm();
      } catch {
        if (alive) { setLoadError("Network trouble loading this lesson."); setState("failed"); }
      }
    })();
    return () => { alive = false; };
  }, [trackId, lessonId, language]);

  /* ---------------------------------------------------------------- */
  /* autosave                                                          */
  /* ---------------------------------------------------------------- */
  const save = useCallback(
    async (extra: { complete?: boolean; attempted?: boolean } = {}) => {
      await fetch(`/api/tracks/${trackId}/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeRef.current, ...extra }),
      }).catch(() => {});
    },
    [trackId, lessonId],
  );

  useEffect(() => {
    if (state !== "ready") return;
    const t = setTimeout(() => void save(), 2000);
    return () => clearTimeout(t);
  }, [code, state, save]);

  /* ---------------------------------------------------------------- */
  /* run                                                               */
  /* ---------------------------------------------------------------- */
  async function run() {
    if (!data || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const cases: TestCase[] = data.lesson.tests.map((t) => ({
        args: t.args, expected: t.expected, sample: t.sample,
      }));
      const out =
        language === "javascript"
          ? await getJsEngine().run(code, cases, data.lesson.func)
          : await getEngine().run(code, cases, "function", data.lesson.func);
      setResults(out.results);
      const passed = out.results.length > 0 && out.results.every((r) => r.passed);
      if (passed && !complete) setComplete(true);
      await save({ attempted: true, complete: passed || undefined });
    } catch (e) {
      setRunError((e as Error).message);
      setResults(null);
    } finally {
      setRunning(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* metered unlocks                                                   */
  /* ---------------------------------------------------------------- */
  async function unlockHint() {
    if (busyUnlock || !data) return;
    setBusyUnlock(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/lessons/${lessonId}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: hints.length }),
      });
      const body = await res.json();
      if (!res.ok) { setUnlockError(body.error ?? "Could not get that hint."); return; }
      setHints((h) => [...h, body.hint]);
    } finally {
      setBusyUnlock(false);
    }
  }

  async function unlockSolution() {
    if (busyUnlock) return;
    setBusyUnlock(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/lessons/${lessonId}/solution`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) { setUnlockError(body.error ?? "Could not reveal the solution."); return; }
      setSolution(body.solution);
      setPanel("solution");
    } finally {
      setBusyUnlock(false);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/lessons/${lessonId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, code }),
      });
      const body = await res.json();
      setThread((t) => [...t, { q, a: res.ok ? body.answer : (body.error ?? "Could not answer that.") }]);
      setQuestion("");
    } catch {
      setThread((t) => [...t, { q, a: "Network trouble." }]);
    } finally {
      setAsking(false);
    }
  }

  /* ---------------------------------------------------------------- */

  if (state === "loading") return <Waiting {...props} />;
  if (state === "failed") return <Failed message={loadError} trackId={trackId} />;
  if (!data) return null;

  const lesson = data.lesson;
  const passed = results?.length ? results.every((r) => r.passed) : false;
  const editorLang = language === "javascript" ? "javascript" : "python";
  const tabBase =
    "px-3 py-1.5 text-[12.5px] font-medium transition border-b-2 -mb-px";

  return (
    <div className="flex h-screen flex-col bg-[#0b0c0f] text-[#e6e8ec]">
      {/* rail --------------------------------------------------- */}
      <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.07] px-5 py-2.5">
        <Link href={`/learn/${trackId}`} className="text-[13px] text-[#8b8f96] hover:text-[#e6e8ec]">
          &larr; Roadmap
        </Link>
        <span className="text-[12px] text-[#5c626c]">
          Lesson {props.position} of {props.total}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{lesson.title}</span>
        {complete && (
          <span className="rounded-full bg-[#00E5FF]/12 px-2.5 py-1 text-[11.5px] font-semibold text-[#00E5FF]">
            Complete
          </span>
        )}
        {complete && props.nextId && (
          <Link
            href={`/learn/${trackId}/${props.nextId}`}
            className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff] px-3 py-1.5 text-[12.5px] font-semibold text-[#04121a] transition hover:brightness-110"
          >
            Next lesson
          </Link>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* teaching -------------------------------------------- */}
        <section className="min-h-0 overflow-y-auto border-b border-white/[0.07] px-6 py-6 lg:w-[46%] lg:border-b-0 lg:border-r">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#4aa3ff]">
            Why this is here
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#9aa1ad]">{lesson.relevance}</p>
          {lesson.adapted && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12.5px] leading-relaxed text-[#8b929d]">
              <span aria-hidden className="mt-px text-[#4aa3ff]">&#8635;</span>
              <span>{lesson.adapted.summary}</span>
            </p>
          )}
          <Markdown source={lesson.teaching} variant="prose" className="mt-6 max-w-[68ch]" />
        </section>

        {/* work ------------------------------------------------- */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <span className="text-[12px] text-[#6b727e]">
              Finish the marked gap. {props.languageLabel}.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCode(lesson.scaffold)}
                className="rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[12px] text-[#9aa1ad] transition hover:border-white/[0.2] hover:text-[#e6e8ec]"
              >
                Reset
              </button>
              <button
                onClick={run}
                disabled={running}
                className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#04121a] transition hover:brightness-110 disabled:opacity-50"
              >
                {running ? "Running…" : "Run"}
              </button>
            </div>
          </div>

          <div className="min-h-[180px] flex-1 overflow-hidden border-y border-white/[0.07]">
            <CodeEditor
              value={code} onChange={setCode} language={editorLang}
              ariaLabel={`${props.languageLabel} exercise`}
            />
          </div>

          {/* results ------------------------------------------- */}
          <div className="max-h-[34%] shrink-0 overflow-y-auto px-4 py-3">
            {runError && (
              <p className="rounded-lg border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.08] px-3 py-2 text-[12.5px] text-[#ffb0b0]">
                {runError}
              </p>
            )}
            {results && (
              <div className="space-y-1.5">
                <p className={`text-[12.5px] font-semibold ${passed ? "text-[#00E5FF]" : "text-[#ffb0b0]"}`}>
                  {passed
                    ? "All tests pass. That is the lesson."
                    : `${results.filter((r) => r.passed).length} of ${results.length} passing.`}
                </p>
                {results.filter((r) => !r.passed).slice(0, 3).map((r, i) => (
                  <pre
                    key={i}
                    className="overflow-x-auto rounded-lg border border-white/[0.07] bg-[#08090c] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#c8ccd4]"
                  >
{r.error
  ? `${r.input}\n  raised ${r.error}`
  : `${r.input}\n  expected ${JSON.stringify(r.expected)}\n  got      ${JSON.stringify(r.got)}`}
                  </pre>
                ))}
              </div>
            )}
            {!results && !runError && (
              <p className="text-[12.5px] text-[#5c626c]">
                Run when you are ready. The tests run in this tab — nothing is graded or scored.
              </p>
            )}
          </div>

          {/* help ---------------------------------------------- */}
          <div className="shrink-0 border-t border-white/[0.07]">
            <div className="flex gap-1 border-b border-white/[0.07] px-4">
              {(["hints", "ask", "solution"] as Panel[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPanel(p)}
                  className={`${tabBase} ${
                    panel === p
                      ? "border-[#4aa3ff] text-[#e6e8ec]"
                      : "border-transparent text-[#6b727e] hover:text-[#9aa1ad]"
                  }`}
                >
                  {p === "hints" ? `Hints (${hints.length}/${lesson.hintCount})`
                    : p === "ask" ? "Ask" : "Solution"}
                </button>
              ))}
            </div>

            <div className="max-h-[240px] overflow-y-auto px-4 py-3">
              {unlockError && (
                <p className="mb-2 rounded-lg border border-[#ffb84d]/30 bg-[#ffb84d]/[0.08] px-3 py-2 text-[12.5px] text-[#ffd79a]">
                  {unlockError}
                </p>
              )}

              {panel === "hints" && (
                <div className="space-y-2">
                  {hints.map((h, i) => (
                    <p key={i} className="text-[13px] leading-relaxed text-[#c8ccd4]">
                      <span className="mr-1.5 text-[#5c626c]">{i + 1}.</span>{h}
                    </p>
                  ))}
                  {hints.length < lesson.hintCount ? (
                    <button
                      onClick={unlockHint} disabled={busyUnlock}
                      className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12.5px] text-[#9aa1ad] transition hover:border-white/[0.2] hover:text-[#e6e8ec] disabled:opacity-50"
                    >
                      {hints.length === 0 ? "Show a hint" : "Show the next hint"}
                      {!props.pro && <span className="ml-1.5 text-[#5c626c]">1 gem or a free hint</span>}
                    </button>
                  ) : (
                    <p className="text-[12px] text-[#5c626c]">That is every hint for this one.</p>
                  )}
                </div>
              )}

              {panel === "ask" && (
                <div className="space-y-3">
                  {thread.map((t, i) => (
                    <div key={i}>
                      <p className="text-[12.5px] font-medium text-[#9aa1ad]">{t.q}</p>
                      <Markdown source={t.a} className="mt-1 text-[13px] text-[#c8ccd4]" />
                    </div>
                  ))}
                  <form onSubmit={ask} className="flex gap-2">
                    <input
                      value={question} onChange={(e) => setQuestion(e.target.value)}
                      maxLength={1000}
                      placeholder={
                        props.knownLabel
                          ? `Ask about this — it knows you come from ${props.knownLabel}`
                          : "Ask about this lesson"
                      }
                      className="flex-1 rounded-lg border border-[#24262b] bg-[#111318] px-3 py-2 text-[13px] outline-none transition focus:border-[#4aa3ff]/60"
                    />
                    <button
                      type="submit" disabled={asking || question.trim().length < 3}
                      className="rounded-lg border border-white/[0.1] px-3 py-2 text-[12.5px] text-[#9aa1ad] transition hover:border-white/[0.2] hover:text-[#e6e8ec] disabled:opacity-40"
                    >
                      {asking ? "…" : "Ask"}
                    </button>
                  </form>
                  <p className="text-[11.5px] text-[#5c626c]">
                    It explains; it will not write the exercise for you. That is what Solution is for.
                  </p>
                </div>
              )}

              {panel === "solution" && (
                solution ? (
                  <pre className="overflow-x-auto rounded-lg border border-white/[0.07] bg-[#08090c] p-3 font-mono text-[12px] leading-relaxed text-[#c8ccd4]">
                    <code>{solution}</code>
                  </pre>
                ) : (
                  <div>
                    <p className="text-[12.5px] leading-relaxed text-[#8b8f96]">
                      Worth trying the third hint first — you learn more from the version you
                      nearly wrote than from the one you read.
                    </p>
                    <button
                      onClick={unlockSolution} disabled={busyUnlock}
                      className="mt-2.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12.5px] text-[#9aa1ad] transition hover:border-white/[0.2] hover:text-[#e6e8ec] disabled:opacity-50"
                    >
                      Show the solution
                      {!props.pro && <span className="ml-1.5 text-[#5c626c]">3 gems or a free reveal</span>}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Waiting(props: { title: string; relevance: string; languageLabel: string; jobTitle: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0c0f] px-6 text-[#e6e8ec]">
      <div className="max-w-md text-center">
        <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff]" />
        </div>
        <h1 className="mt-5 text-[18px] font-semibold">{props.title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#8b8f96]">
          Writing this lesson and checking it against its own tests. It only happens the first
          time anyone opens it, and it is why the exercise you get actually runs.
        </p>
      </div>
    </div>
  );
}

function Failed({ message, trackId }: { message: string | null; trackId: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0c0f] px-6 text-[#e6e8ec]">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-semibold">This lesson is not ready</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#8b8f96]">
          {message ?? "Something went wrong."}
        </p>
        <Link
          href={`/learn/${trackId}`}
          className="mt-5 inline-block rounded-lg border border-white/[0.1] px-3.5 py-2 text-[13px] text-[#9aa1ad] transition hover:border-white/[0.2] hover:text-[#e6e8ec]"
        >
          Back to the roadmap
        </Link>
      </div>
    </div>
  );
}
