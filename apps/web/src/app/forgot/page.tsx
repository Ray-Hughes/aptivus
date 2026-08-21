"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/account/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? undefined : "We will email you a link to set a new one."}
      footer={<Link href="/signin" className="text-[#4aa3ff] hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <p className="rounded-lg border border-[#255239] bg-[#132a1d] px-3.5 py-3 text-[13px] leading-relaxed text-[#a6e5c0]">
          If that address has an account, a reset link is on its way. It expires in 15 minutes.
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" required autoFocus value={email}
                 onChange={(e) => setEmail(e.target.value)} className={inputClass}
                 placeholder="you@example.com" autoComplete="email" />
          <div className="mt-6">
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
