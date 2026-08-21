"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Two facts decide the whole roadmap: what you already know, and what the job
 * actually is. Everything else on this form is noise, so there is nothing else
 * on this form.
 */
export function NewTrackForm({
  targets, known, knownLabels, mappedPairs, hasExpertise, pro, gems, cost,
}: {
  targets: { slug: string; label: string }[];
  known: string[];
  knownLabels: Record<string, string>;
  mappedPairs: { from: string; to: string }[];
  hasExpertise: boolean;
  pro: boolean;
  gems: number;
  cost: number;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(targets[0]?.slug ?? "python");
  const [jobTitle, setJobTitle] = useState("");
  const [jobContext, setJobContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = known.filter((k) => k !== target);
  // Whether we hold authored, human-checked correspondences for this pair, or
  // are relying on the model's own knowledge. The learner deserves to know
  // which, because they cannot check the comparisons themselves.
  const mapped = from.some((f) => mappedPairs.some((p) => p.from === f && p.to === target));
  const affordable = pro || gems >= cost;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage: target,
          jobTitle: jobTitle.trim(),
          jobContext: jobContext.trim() || undefined,
          knownLanguages: from,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not build that roadmap.");
        return;
      }
      router.push(`/learn/${data.trackId}`);
    } catch {
      setError("Network trouble. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-[#24262b] bg-[#111318] px-3 py-2 text-[14px] text-[#e6e8ec] outline-none transition focus:border-[#4aa3ff]/60";
  const label = "text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8b8f96]";

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div>
        <label className={label} htmlFor="target">Language to learn</label>
        <select id="target" className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.slug} value={t.slug}>{t.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[12px] text-[#6b727e]">
          Only languages we can actually run in your browser are offered. Listing one we cannot
          execute would mean lessons you cannot complete.
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <p className="text-[12.5px] leading-relaxed text-[#9aa1ad]">
          Teaching by comparison to{" "}
          <span className="text-[#c8ccd4]">
            {from.length ? from.map((f) => knownLabels[f] ?? f).join(", ") : "nothing yet"}
          </span>
          .{" "}
          {!hasExpertise && (
            <>
              That came from your primary language.{" "}
              <Link href="/settings" className="text-[#4aa3ff] hover:underline">
                Add what you already know
              </Link>{" "}
              for a sharper roadmap.
            </>
          )}
        </p>
        {from.length > 0 && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#6b727e]">
            {mapped
              ? "We hold a human-written map of the traps between these two languages, so the comparisons are checked rather than improvised."
              : "We have no authored map for this pair yet, so comparisons come from the model alone. It is told to stay quiet rather than guess, but treat them with more suspicion than usual."}
          </p>
        )}
      </div>

      <div>
        <label className={label} htmlFor="jobTitle">The job</label>
        <input
          id="jobTitle" className={field} value={jobTitle} required minLength={4} maxLength={120}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Senior Backend Engineer, payments platform"
        />
      </div>

      <div>
        <label className={label} htmlFor="jobContext">What you will actually be doing</label>
        <textarea
          id="jobContext" className={`${field} min-h-[160px] resize-y font-mono text-[13px]`}
          value={jobContext} maxLength={4000}
          onChange={(e) => setJobContext(e.target.value)}
          placeholder="Paste the job description, or describe the stack: services, databases, what breaks at 3am."
        />
      </div>

      {error && (
        <p className="rounded-lg border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.08] px-3.5 py-2.5 text-[13px] text-[#ffb0b0]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || jobTitle.trim().length < 4 || !from.length || !affordable}
          className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff] px-4 py-2.5 text-[13px] font-semibold text-[#04121a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Designing your roadmap…" : "Build my roadmap"}
        </button>
        <span className="text-[12px] text-[#6b727e]">
          {pro ? "Included with Pro." : `${cost} gems — you have ${gems}.`}
        </span>
      </div>
      {busy && (
        <p className="text-[12.5px] text-[#8b8f96]">
          This takes a minute. It is reading the job and deciding what you can safely not learn yet.
        </p>
      )}
    </form>
  );
}
