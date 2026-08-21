import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------- */
/* formatting                                                        */
/* ---------------------------------------------------------------- */

export function formatDate(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatDay(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function relativeTime(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "—";
  const seconds = Math.floor(Date.now() / 1000) - epochSeconds;
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "min"],
    [3600, "hr"],
    [86400, "day"],
    [604800, "wk"],
    [2592000, "mo"],
  ];
  let value = seconds;
  let label = "sec";
  for (const [size, name] of units) {
    if (seconds >= size) {
      value = Math.floor(seconds / size);
      label = name;
    }
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}

/* ---------------------------------------------------------------- */
/* surfaces                                                          */
/* ---------------------------------------------------------------- */

export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-edge bg-surface ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "accent" | "accent2" | "brand" | "muted";
}) {
  const bar =
    tone === "brand"
      ? "brand-bar"
      : tone === "accent2"
        ? "bg-accent2"
        : tone === "muted"
          ? "bg-edge"
          : "bg-accent";
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface">
      <div className={`h-0.5 w-full ${bar}`} />
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "border-edge bg-raised text-muted",
    good: "border-accent/40 bg-accent/10 text-accent",
    bad: "border-danger/40 bg-danger/10 text-danger",
    warn: "border-warn/40 bg-warn/10 text-warn",
    info: "border-accent2/40 bg-accent2/10 text-accent2",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* tables                                                            */
/* ---------------------------------------------------------------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-edge px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-faint ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-edge/60 px-4 py-2.5 align-middle ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <Td colSpan={colSpan} className="py-10 text-center text-sm text-muted">
        {children}
      </Td>
    </tr>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-edge px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* pagination                                                        */
/* ---------------------------------------------------------------- */

export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  total,
  noun = "rows",
}: {
  basePath: string;
  params: Record<string, string | number | undefined | null>;
  page: number;
  pageCount: number;
  total: number;
  noun?: string;
}) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pageCount;
  const linkClass =
    "rounded-md border border-edge bg-raised px-3 py-1.5 text-sm transition hover:border-accent2";
  const disabledClass =
    "rounded-md border border-edge/50 bg-raised/40 px-3 py-1.5 text-sm text-faint";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-3">
      <p className="text-xs text-muted">
        {total.toLocaleString()} {noun} · page {page} of {Math.max(pageCount, 1)}
      </p>
      <div className="flex gap-2">
        {prevDisabled ? (
          <span className={disabledClass}>Previous</span>
        ) : (
          <Link
            href={`${basePath}${buildQuery({ ...params, page: page - 1 })}`}
            className={linkClass}
          >
            Previous
          </Link>
        )}
        {nextDisabled ? (
          <span className={disabledClass}>Next</span>
        ) : (
          <Link
            href={`${basePath}${buildQuery({ ...params, page: page + 1 })}`}
            className={linkClass}
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* misc                                                              */
/* ---------------------------------------------------------------- */

export function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    text = JSON.stringify(parsed, null, 2);
  } catch {
    text = String(value ?? "");
  }
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border border-edge bg-ink p-4 font-mono text-xs leading-relaxed text-fg">
      {text}
    </pre>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-warn/40 bg-warn/10 text-warn"
      : "border-accent2/40 bg-accent2/10 text-accent2";
  return (
    <p className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent2 focus:outline-none";

export const selectClass =
  "rounded-md border border-edge bg-ink px-3 py-2 text-sm text-fg focus:border-accent2 focus:outline-none";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-edge bg-raised px-3.5 py-2 text-sm font-medium text-fg transition hover:border-accent2 disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-danger/50 bg-danger/10 px-3.5 py-2 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60";
