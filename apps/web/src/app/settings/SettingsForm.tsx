"use client";

import { useState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/AuthShell";

export function SettingsForm({
  initialName, initialCompany, initialRole, initialLanguage, companies,
}: {
  initialName: string;
  initialCompany: string;
  initialRole: string;
  initialLanguage: string;
  companies: { slug: string; name: string }[];
}) {
  const [form, setForm] = useState({
    displayName: initialName,
    targetCompany: initialCompany,
    targetRole: initialRole,
    primaryLanguage: initialLanguage,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    setSaved(true);
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

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={busy} className={`${buttonClass} w-auto`}>
          {busy ? "Saving..." : "Save"}
        </button>
        {saved && <span role="status" className="text-[13px] text-[#39c06c]">Saved</span>}
      </div>
    </form>
  );
}
