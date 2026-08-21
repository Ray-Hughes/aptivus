"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/forms";

/**
 * One button, one Server Action, one set of hidden fields.
 *
 * Every course mutation goes through a real form, so it works before the
 * JavaScript has arrived and keeps working if it never does. `useActionState`
 * is here for the pending state and the error message, not to do the work.
 */
export type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const VARIANTS = {
  primary:
    "bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] font-semibold text-[#0b0c0f] hover:brightness-110",
  ghost:
    "border border-white/12 bg-white/[0.04] text-[#e6e8ec] hover:bg-white/[0.09]",
  quiet: "text-[#9aa1ad] hover:text-white",
} as const;

export function ActionButton({
  action,
  fields,
  children,
  pendingLabel,
  variant = "ghost",
  className = "",
  title,
}: {
  action: ServerAction;
  fields: Record<string, string>;
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        title={title}
        className={`rounded-lg px-4 py-2 text-[13.5px] outline-none ring-offset-2 ring-offset-[#0b0c0f] transition focus-visible:ring-2 focus-visible:ring-[#4aa3ff] disabled:opacity-60 ${VARIANTS[variant]}`}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {/* Only failures speak. A success re-renders the page, which says it better. */}
      <p aria-live="polite" className="sr-only">
        {state?.ok ? state.message : ""}
      </p>
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-[12.5px] text-[#ff9d9d]">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
