"use client";

import { useActionState, useRef, type ReactNode } from "react";
import { idle, type ActionState } from "@/lib/forms";
import { buttonClass, dangerButtonClass, ghostButtonClass } from "./ui";

type Variant = "primary" | "ghost" | "danger";

const CLASSES: Record<Variant, string> = {
  primary: buttonClass,
  ghost: ghostButtonClass,
  danger: dangerButtonClass,
};

/**
 * Wraps a Server Action with pending state and an inline result message, so
 * every mutation in the panel reports success or failure the same way.
 */
export default function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  confirm,
  className = "",
  footerClassName = "mt-4 flex flex-wrap items-center gap-3",
  hidden,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: Variant;
  confirm?: string;
  className?: string;
  footerClassName?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {children}

      <div className={footerClassName}>
        <button type="submit" disabled={pending} className={CLASSES[variant]}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
        {state ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
