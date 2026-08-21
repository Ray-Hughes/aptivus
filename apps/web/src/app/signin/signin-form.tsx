"use client";

import { useActionState } from "react";
import { signInWithPassword } from "./actions";
import { idle } from "@/lib/forms";

export default function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInWithPassword, idle);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="rounded-md border border-edge bg-ink px-3 py-2 text-fg placeholder:text-faint focus:border-accent2 focus:outline-none"
          placeholder="you@example.com"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-edge bg-ink px-3 py-2 text-fg placeholder:text-faint focus:border-accent2 focus:outline-none"
          placeholder="••••••••••"
        />
      </label>

      {state && !state.ok ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-accent px-4 py-2 font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
