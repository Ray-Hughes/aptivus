"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavGlyph } from "./icons";
import { NAV, activeItem } from "./nav";

const STORAGE_KEY = "aptivus.admin.sidebar";

export default function Sidebar() {
  const pathname = usePathname() ?? "/admin";
  const active = activeItem(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode: fall back to expanded */
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <nav
      aria-label="Admin sections"
      data-collapsed={collapsed ? "true" : "false"}
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-edge bg-surface transition-[width] duration-150 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="brand-bar h-1 w-full" />

      <div
        className={`flex px-3 ${
          collapsed ? "flex-col items-center gap-2 py-3" : "h-14 items-center gap-2"
        }`}
      >
        <Link
          href="/admin"
          className="flex min-w-0 items-center gap-2"
          title="Aptivus admin"
        >
          <span className="brand-bar grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm font-bold text-[#0d0d10]">
            A
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">
              Aptivus <span className="text-faint">admin</span>
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={hydrated ? !collapsed : undefined}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg ${
            collapsed ? "" : "ml-auto"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
            className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6 4.6-4.6Z" />
          </svg>
        </button>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {NAV.map((item) => {
          const isActive = active?.href === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-raised font-medium text-fg"
                    : "text-muted hover:bg-raised/60 hover:text-fg"
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
                  />
                )}
                <NavGlyph
                  name={item.icon}
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-accent" : ""}`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
