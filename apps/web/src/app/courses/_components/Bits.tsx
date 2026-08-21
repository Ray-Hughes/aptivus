/**
 * The three small pieces the three course pages share. Server components -
 * none of this needs to be in the browser bundle.
 */
import type { ModuleStatus } from "@/lib/courses";

export const card = "rounded-2xl border border-white/[0.07] bg-white/[0.02]";

/** The one gradient in the palette, used for progress and for one CTA a view. */
export function Meter({
  value,
  className = "",
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`h-1.5 overflow-hidden rounded-full bg-white/[0.07] ${className}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const DOT = {
  complete: "border-[#2f6b45] bg-[#12331f] text-[#7fe0a2]",
  "in-progress": "border-[#4a3a1a] bg-[#251c0d] text-[#e6b455]",
  "not-started": "border-white/12 text-[#7f8794]",
} as const;

const GLYPH = { complete: "✓", "in-progress": "•", "not-started": "○" } as const;

const WORD = {
  complete: "complete",
  "in-progress": "in progress",
  "not-started": "not started",
} as const;

export function StateDot({ state }: { state: ModuleStatus["state"] }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${DOT[state]}`}
    >
      <span aria-hidden>{GLYPH[state]}</span>
      <span className="sr-only">{WORD[state]}</span>
    </span>
  );
}

export function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "level" }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${
        tone === "level"
          ? "border-[#2a4a6b] bg-[#0e1c2b] text-[#7fc3ff]"
          : "border-white/10 text-[#9aa1ad]"
      }`}
    >
      {children}
    </span>
  );
}

/** "13h", "45m" - never "13.0 hours". */
export function hours(h: number): string {
  return h >= 1 ? `${Number(h.toFixed(2))}h` : `${Math.round(h * 60)}m`;
}

export function minutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
