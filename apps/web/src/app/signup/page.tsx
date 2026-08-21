"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      // Sign straight in; email verification is a separate, non-blocking step.
      const signedIn = await signIn("password", {
        email: form.email, password: form.password, redirect: false,
      });
      router.push(signedIn?.error ? "/signin" : "/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. No card required."
      footer={<>Already have one? <Link href="/signin" className="text-[#4aa3ff] hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <label className={labelClass} htmlFor="name">Name <span className="text-[#5f646d]">(optional)</span></label>
        <input id="name" value={form.displayName} onChange={set("displayName")}
               className={inputClass} placeholder="Raymond" autoComplete="name" />

        <div className="mt-4">
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" required value={form.email} onChange={set("email")}
                 className={inputClass} placeholder="you@example.com" autoComplete="email" />
        </div>

        <div className="mt-4">
          <label className={labelClass} htmlFor="password">Password</label>
          <input id="password" type="password" required value={form.password} onChange={set("password")}
                 className={inputClass} placeholder="At least 10 characters"
                 autoComplete="new-password" />
          <p className="mt-1.5 text-[11.5px] text-[#6f747c]">At least 10 characters.</p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-[#5c2b2b] bg-[#2a1618] px-3 py-2 text-[12.5px] text-[#ff9d9d]">
            {error}
          </p>
        )}

        <div className="mt-6">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? "Creating..." : "Create account"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
