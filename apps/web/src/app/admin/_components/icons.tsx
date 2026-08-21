import type { NavIcon } from "./nav";

const PATHS: Record<NavIcon, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z",
  users:
    "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-6 1.34-6 4v2h7v-2c0-1.1.44-2.06 1.16-2.82A9.7 9.7 0 0 0 8 14Zm8 0c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z",
  problems:
    "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z",
  companies:
    "M3 21V7l6-4v4l6-3v6h6v11H3Zm2-2h4v-3H5v3Zm0-5h4v-3H5v3Zm0-5h4V6H5v3Zm6 10h4v-3h-4v3Zm0-5h4v-3h-4v3Zm0-5h4V6h-4v3Zm6 10h4v-3h-4v3Zm0-5h4v-3h-4v3Z",
  payments:
    "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H4v-6h16v6Zm0-10H4V6h16v2Z",
  flags:
    "M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6Z",
  achievements:
    "M12 15a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm-4 1.2V22l4-2 4 2v-5.8a7 7 0 0 1-8 0Z",
  audit:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm2 16H8v-2h8v2Zm0-4H8v-2h8v2Zm-3-5V3.5L18.5 9H13Z",
};

export function NavGlyph({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
