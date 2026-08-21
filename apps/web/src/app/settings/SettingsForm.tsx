"use client";

import { useState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/AuthShell";
import {
  EXPERTISE_LANGUAGES,
  EXPERTISE_LEVELS,
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  type ExpertiseEntry,
  type ExpertiseLanguage,
  type ExpertiseLevel,
} from "@/lib/expertise";

export function SettingsForm({
  initialName, initialCompany, initialRole, initialLanguage, initialExpertise, companies,
}: {
  initialName: string;
  initialCompany: string;
  initialRole: string;
  initialLanguage: string;
  initialExpertise: ExpertiseEntry[];
  companies: { slug: string; name: string }[];
}) {
  const [form, setForm] = useState({
    displayName: initialName,
    targetCompany: initialCompany,
    targetRole: initialRole,
    primaryLanguage: initialLanguage,
    expertise: initialExpertise,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const taken = new Set(form.expertise.map((e) => e.language));
  const unused = EXPERTISE_LANGUAGES.filter((l) => !taken.has(l));

  function setExpertise(next: ExpertiseEntry[]) {
    setForm((f) => ({ ...f, expertise: next }));
  }

  function addRow() {
    const language = unused[0];
    if (!language) return;
    setExpertise([...form.expertise, { language, level: "working" }]);
  }

  function editRow(index: number, patch: Partial<ExpertiseEntry>) {
    setExpertise(form.expertise.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError("");
    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) setSaved(true);
    else setError("That did not save. Check the fields and try again.");
  }

  return (
    <form onSubmit={save} className="mt-6 rounded-xl border border-[#24262b] bg-[#17181c] p-5">
      <h2 className="text-[15px] font-semibold">Profile</h2>

      <div className="mt-4">
        <label className={labelClass} htmlFor="name">Display name</label>
        <input id="name" className={inputClass} value={form.displayName}
               onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </div>

      <div className="mt-4">
        <label className={labelClass} htmlFor="company">Target company</label>
        <select id="company" className={inputClass} value={form.targetCompany}
                onChange={(e) => setForm({ ...form, targetCompany: e.target.value })}>
          <option value="">Not set</option>
          {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <p className="mt-1.5 text-[11.5px] text-[#6f747c]">
          Used to target practice at the patterns that company actually tests.
        </p>
      </div>

      <div className="mt-4">
        <label className={labelClass} htmlFor="role">Target role</label>
        <input id="role" className={inputClass} value={form.targetRole}
               placeholder="Senior Forward Deployed Engineer"
               onChange={(e) => setForm({ ...form, targetRole: e.target.value })} />
      </div>

      <div className="mt-4">
        <label className={labelClass} htmlFor="lang">Primary language</label>
        <select id="lang" className={inputClass} value={form.primaryLanguage}
                onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })}>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="ruby">Ruby</option>
          <option value="sql">SQL</option>
        </select>
      </div>

      <div className="mt-6 border-t border-[#24262b] pt-5">
        <h3 className="text-[13px] font-medium text-[#a9adb5]">Languages you already know</h3>
        <p className="mt-1.5 text-[11.5px] text-[#6f747c]">
          A new language is taught by comparison to these, so the level matters more
          than the count. Only list what you would be comfortable being asked about.
        </p>

        {form.expertise.length === 0 ? (
          <p className="mt-3 rounded-lg border border-[#2b2d33] bg-[#101115] px-3.5 py-2.5 text-[12.5px] text-[#6f747c]">
            Nothing listed yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {form.expertise.map((entry, i) => (
              <li key={entry.language} className="flex items-center gap-2">
                <select
                  aria-label={`Language ${i + 1}`}
                  className={`${inputClass} flex-1`}
                  value={entry.language}
                  onChange={(e) => editRow(i, { language: e.target.value as ExpertiseLanguage })}
                >
                  {/* Its own language plus the unused ones: a duplicate is not
                      offered rather than rejected after the fact. */}
                  {EXPERTISE_LANGUAGES.filter((l) => l === entry.language || !taken.has(l)).map((l) => (
                    <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
                  ))}
                </select>
                <select
                  aria-label={`How well you know ${LANGUAGE_LABELS[entry.language]}`}
                  className={`${inputClass} flex-[1.5]`}
                  value={entry.level}
                  onChange={(e) => editRow(i, { level: e.target.value as ExpertiseLevel })}
                >
                  {EXPERTISE_LEVELS.map((l) => (
                    <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${LANGUAGE_LABELS[entry.language]}`}
                  onClick={() => setExpertise(form.expertise.filter((_, j) => j !== i))}
                  className="rounded-lg border border-[#33363d] px-3 py-2.5 text-[13px] leading-none text-[#8b8f96] transition hover:border-[#4a4f57] hover:bg-[#1d1f24] hover:text-[#dfe1e5]"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={addRow}
          disabled={unused.length === 0}
          className="mt-3 rounded-lg border border-[#33363d] px-3 py-1.5 text-[12.5px] font-medium text-[#dfe1e5] transition hover:border-[#4a4f57] hover:bg-[#1d1f24] disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add language
        </button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={busy} className={`${buttonClass} w-auto`}>
          {busy ? "Saving..." : "Save"}
        </button>
        {saved && <span role="status" className="text-[13px] text-[#39c06c]">Saved</span>}
        {error && <span role="alert" className="text-[13px] text-[#ff9d9d]">{error}</span>}
      </div>
    </form>
  );
}
