"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Item = {
  slug: string; title: string; kind: string; difficulty: string;
  pattern: string | null; minutes: number; pack: string;
  status: string; tries: number;
};

const DIFF: Record<string, string> = {
  easy: "text-[#7fe0a2]", medium: "text-[#e6b455]", hard: "text-[#ff9d9d]",
};

export function ProblemFilters({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [diff, setDiff] = useState("all");
  const [status, setStatus] = useState("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (diff !== "all" && i.difficulty !== diff) return false;
      if (status !== "all" && i.status !== status) return false;
      if (!needle) return true;
      return `${i.title} ${i.pattern ?? ""} ${i.slug}`.toLowerCase().includes(needle);
    });
  }, [items, q, kind, diff, status]);

  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-[12.5px] transition ${
      on ? "bg-white/[0.12] text-white" : "text-[#9aa1ad] hover:text-white"
    }`;

  const group = (
    value: string, set: (v: string) => void, opts: [string, string][], label: string,
  ) => (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg bg-white/[0.04] p-1">
      {opts.map(([v, l]) => (
        <button key={v} onClick={() => set(v)} aria-pressed={value === v} className={chip(value === v)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center gap-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title or pattern…"
          aria-label="Filter problems"
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13.5px] outline-none placeholder:text-[#6b727e] focus:border-[#4aa3ff]"
        />
        {group(kind, setKind, [["all", "All"], ["code", "Code"], ["sql", "SQL"]], "Kind")}
        {group(diff, setDiff, [["all", "Any"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]], "Difficulty")}
        {group(status, setStatus, [["all", "All"], ["new", "Unsolved"], ["solved", "Solved"]], "Status")}
      </div>

      <p className="mt-3 text-[12.5px] text-[#7f8794]">
        {shown.length} of {items.length} shown
      </p>

      {shown.length === 0 ? (
        <p className="mt-10 rounded-xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-[14px] text-[#9aa1ad]">
          Nothing matches that. Try clearing a filter.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          {shown.map((i) => (
            <li key={i.slug}>
              <Link
                href={`/practice/${i.slug}`}
                className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden
                  title={i.status}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                    i.status === "solved"
                      ? "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]"
                      : i.status === "tried"
                        ? "border-[#4a3a1a] bg-[#251c0d] text-[#e6b455]"
                        : "border-white/12 text-[#6b727e]"
                  }`}
                >
                  {i.status === "solved" ? "✓" : i.status === "tried" ? "•" : "○"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-white">{i.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#7f8794]">
                    {i.pattern}
                    {i.tries > 0 && ` · ${i.tries} attempt${i.tries === 1 ? "" : "s"}`}
                  </span>
                </span>

                <span className="hidden shrink-0 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-[#9aa1ad] sm:block">
                  {i.kind === "sql" ? "SQL" : "Python"}
                </span>
                <span className={`shrink-0 text-[12px] ${DIFF[i.difficulty] ?? "text-[#9aa1ad]"}`}>
                  {i.difficulty}
                </span>
                <span className="hidden shrink-0 text-[12px] text-[#6b727e] sm:block">
                  {i.minutes}m
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
