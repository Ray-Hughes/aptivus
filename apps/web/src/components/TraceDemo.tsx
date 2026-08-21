"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A scrubbable trace of two-sum on the landing page.
 *
 * The steps are a real recording of what the engine produces for this input -
 * same line numbers, same variables, same narration shape - so the marketing
 * claim and the product agree. It autoplays once when scrolled into view, then
 * hands control to the reader.
 */
const CODE = [
  "def find_pair(premiums, target):",
  "    seen = {}                       # value -> index we saw it at",
  "    for i, p in enumerate(premiums):",
  "        need = target - p",
  "        if need in seen:",
  "            return [seen[need], i]",
  "        seen[p] = i                 # insert AFTER the check",
  "    return []",
];

type Step = { line: number; note: string; vars: Record<string, string> };

const STEPS: Step[] = [
  { line: 2, note: "The function was called. Its arguments are set up and nothing else has run yet.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500" } },
  { line: 3, note: "Line 2 set seen = {}.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{}" } },
  { line: 4, note: "The loop on line 3 handed out the next values: i = 0, p = 2500.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{}", i: "0", p: "2500" } },
  { line: 5, note: "Line 4 set need = 4000.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{}", i: "0", p: "2500", need: "4000" } },
  { line: 7, note: "The condition on line 5 was false, so we skipped its block. 4000 has not been seen.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{}", i: "0", p: "2500", need: "4000" } },
  { line: 3, note: "Line 7 set seen = {2500: 0}. The book now remembers where 2500 was.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0}", i: "0", p: "2500", need: "4000" } },
  { line: 4, note: "The loop on line 3 handed out the next values: i = 1, p = 7500.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0}", i: "1", p: "7500", need: "4000" } },
  { line: 7, note: "need became -1000, which is not in seen, so we skipped the block again.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0}", i: "1", p: "7500", need: "-1000" } },
  { line: 3, note: "Line 7 set seen = {2500: 0, 7500: 1}.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0, 7500: 1}", i: "1", p: "7500", need: "-1000" } },
  { line: 4, note: "The loop handed out i = 3, p = 4000. Two entries are already remembered.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0, 7500: 1, 11000: 2}", i: "3", p: "4000", need: "-4500" } },
  { line: 5, note: "Line 4 set need = 2500. That value is in the book.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0, 7500: 1, 11000: 2}", i: "3", p: "4000", need: "2500" } },
  { line: 6, note: "The condition on line 5 was true, so we stepped into its block.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0, 7500: 1, 11000: 2}", i: "3", p: "4000", need: "2500" } },
  { line: 6, note: "Returns [0, 3]. 2500 was at index 0, and we are at index 3.",
    vars: { premiums: "[2500, 7500, 11000, 4000]", target: "6500", seen: "{2500: 0, 7500: 1, 11000: 2}", i: "3", p: "4000", need: "2500" } },
];

export function TraceDemo() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pinned, setPinned] = useState<string | null>("seen");
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Autoplay once when it comes into view, unless the reader prefers less motion.
  useEffect(() => {
    const el = box.current;
    if (!el || started.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !started.current) {
        started.current = true;
        setPlaying(true);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setI((n) => (n >= STEPS.length - 1 ? (setPlaying(false), n) : n + 1));
    }, 950);
    return () => clearTimeout(t);
  }, [playing, i]);

  const step = STEPS[i];
  const prev = i > 0 ? STEPS[i - 1] : null;
  const changed = (name: string) => prev && prev.vars[name] !== step.vars[name];

  return (
    <div ref={box} className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0f1013] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
        <span className="font-mono text-[12px] text-[#7f8794]">
          find_pair · Two accounts hitting a premium target
        </span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-[11px] text-[#9aa1ad]">
          Python 3.12
        </span>
      </div>

      <div className="grid md:grid-cols-[1.05fr_1fr]">
        {/* code */}
        <pre className="overflow-x-auto border-b border-white/[0.07] p-4 font-mono text-[12.5px] leading-[1.65] md:border-b-0 md:border-r">
          {CODE.map((line, n) => {
            const active = n + 1 === step.line;
            return (
              <div
                key={n}
                className={`-mx-2 flex gap-3 rounded px-2 ${active ? "bg-[#4aa3ff]/[0.16]" : ""}`}
              >
                <span className="w-4 shrink-0 select-none text-right text-[#4c525d]">{n + 1}</span>
                <span className={active ? "text-[#e6e8ec]" : "text-[#8b929d]"}>{line || " "}</span>
              </div>
            );
          })}
        </pre>

        {/* stepper */}
        <div className="p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPlaying(false); setI((n) => Math.max(0, n - 1)); }}
              disabled={i === 0}
              aria-label="Previous step"
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[12px] disabled:opacity-30"
            >
              ◀
            </button>
            <button
              onClick={() => { if (i >= STEPS.length - 1) setI(0); setPlaying((p) => !p); }}
              className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-3 py-1 text-[12px] font-semibold text-[#0b0c0f]"
            >
              {playing ? "Pause" : "▶ Play"}
            </button>
            <button
              onClick={() => { setPlaying(false); setI((n) => Math.min(STEPS.length - 1, n + 1)); }}
              disabled={i >= STEPS.length - 1}
              aria-label="Next step"
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[12px] disabled:opacity-30"
            >
              ▶
            </button>
            <input
              type="range" min={0} max={STEPS.length - 1} value={i}
              onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
              aria-label="Step through the trace"
              className="ml-1 flex-1 accent-[#00E5FF]"
            />
            <span className="font-mono text-[11.5px] text-[#7f8794]">
              {i + 1}/{STEPS.length}
            </span>
          </div>

          <p className="mt-4 min-h-[3.2em] text-[13px] leading-relaxed text-[#00E5FF]">{step.note}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.keys(step.vars).map((name) => (
              <button
                key={name}
                onClick={() => setPinned(pinned === name ? null : name)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                  changed(name)
                    ? "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]"
                    : pinned === name
                      ? "border-[#4aa3ff] bg-[#16283a] text-[#cfe3ff]"
                      : "border-white/10 bg-white/[0.03] text-[#9aa1ad]"
                }`}
              >
                <span className="text-[#4aa3ff]">{name}</span> {step.vars[name]}
              </button>
            ))}
          </div>

          {pinned && step.vars[pinned] && (
            <div className="mt-3 overflow-hidden rounded-lg border border-[#4aa3ff]/60">
              <div className="flex items-center justify-between bg-[#16283a] px-3 py-1.5 font-mono text-[11px]">
                <span className="text-[#4aa3ff]">{pinned}</span>
                <span className="text-[#7f8794]">pinned — steps with you</span>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-[11.5px] text-[#e6e8ec]">
                {step.vars[pinned]}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
