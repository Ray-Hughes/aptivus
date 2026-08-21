"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/courses", label: "Courses" },
  { href: "/learn", label: "Learn" },
  { href: "/problems", label: "Problems" },
  { href: "/mock", label: "Mock Interview" },
  { href: "/dashboard", label: "Progress" },
];

export function AppHeader({
  name, email, image, role, gems, streak,
}: {
  name?: string | null;
  email: string;
  image?: string | null;
  role: string;
  gems: number;
  streak: number;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Close on outside click and on Escape, returning focus to the trigger -
  // a menu you cannot dismiss from the keyboard is a trap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (name ?? email)
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase()).join("") || "?";

  const item =
    "block w-full px-3.5 py-2 text-left text-[13.5px] text-[#c8ccd4] transition " +
    "hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:outline-none";

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0b0c0f]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-7">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={24} height={24} priority />
            <span className="text-[14.5px] font-semibold tracking-tight text-white">Aptivus</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = path === n.href || path.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-[13.5px] transition ${
                    active ? "bg-white/[0.08] text-white" : "text-[#9aa1ad] hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span
              title={`${streak} day streak`}
              className="hidden items-center gap-1.5 rounded-full border border-[#4a3a1a] bg-[#251c0d] px-2.5 py-1 text-[12px] text-[#e6b455] sm:flex"
            >
              <span aria-hidden>🔥</span>
              {streak}
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] text-[#c8ccd4]">
            <span aria-hidden className="text-[#4aa3ff]">◆</span>
            {gems}
          </span>

          <div className="relative" ref={wrap}>
            <button
              ref={trigger}
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Account menu"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#00E5FF] to-[#9E7BFF] text-[12.5px] font-bold text-[#0b0c0f] outline-none ring-offset-2 ring-offset-[#0b0c0f] focus-visible:ring-2 focus-visible:ring-[#4aa3ff]"
            >
              {image ? (
                <Image src={image} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
              ) : (
                initials
              )}
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#15171c] py-1 shadow-2xl"
              >
                <div className="border-b border-white/[0.07] px-3.5 py-2.5">
                  <p className="truncate text-[13px] font-medium text-white">{name ?? "Account"}</p>
                  <p className="truncate text-[11.5px] text-[#7f8794]">{email}</p>
                </div>
                <Link href="/dashboard" role="menuitem" className={item} onClick={() => setOpen(false)}>
                  Progress
                </Link>
                <Link href="/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
                  Settings
                </Link>
                {role === "admin" && (
                  <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
                    Admin
                  </Link>
                )}
                <div className="my-1 border-t border-white/[0.07]" />
                <button
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className={`${item} text-[#ff9d9d] hover:text-[#ffb4b4]`}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
