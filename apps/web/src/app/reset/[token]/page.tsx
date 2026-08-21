"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Those two do not match.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong.");
    router.push("/signin?reset=1");
  }

  return (
    <AuthShell
      title="Choose a new password"
      footer={<Link href="/signin" className="text-[#4aa3ff] hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} noValidate>
        <label className={labelClass} htmlFor="pw">New password</label>
        <input id="pw" type="password" required autoFocus value={password}
               onChange={(e) => setPassword(e.target.value)} className={inputClass}
               placeholder="At least 10 characters" autoComplete="new-password" />
        <div className="mt-4">
          <label className={labelClass} htmlFor="pw2">Confirm</label>
          <input id="pw2" type="password" required value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} className={inputClass}
                 placeholder="Type it again" autoComplete="new-password" />
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-[#5c2b2b] bg-[#2a1618] px-3 py-2 text-[12.5px] text-[#ff9d9d]">
            {error}
          </p>
        )}
        <div className="mt-6">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? "Saving..." : "Set new password"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
