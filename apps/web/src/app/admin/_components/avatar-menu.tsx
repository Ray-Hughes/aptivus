"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "../_actions/session";

export type AvatarUser = {
  name: string | null;
  email: string;
  image: string | null;
};

export function initialsOf(user: AvatarUser): string {
  const source = (user.name ?? "").trim() || user.email;
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0] ?? "");
  return (letters.join("") || "?").toUpperCase();
}

export default function AvatarMenu({ user }: { user: AvatarUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside click and Escape both close. Escape also returns focus to the
  // trigger, otherwise keyboard users are stranded at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // Move focus into the menu when it opens via the keyboard or a click.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>("[data-menuitem]");
    first?.focus();
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[data-menuitem]") ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  const label = user.name?.trim() || user.email;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        id="admin-avatar-button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="admin-avatar-menu"
        aria-label={`Account menu for ${label}`}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-edge bg-raised text-xs font-semibold text-fg transition hover:border-accent2"
      >
        {user.image ? (
          // Remote avatars come from arbitrary providers, so next/image's
          // allow-list config would have to be widened for each one.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden="true">{initialsOf(user)}</span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          id="admin-avatar-menu"
          role="menu"
          aria-labelledby="admin-avatar-button"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-edge bg-surface shadow-xl shadow-black/40"
        >
          <div className="border-b border-edge px-3 py-3">
            <p className="truncate text-sm font-medium">{user.name ?? "Admin"}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <Link
            href="/admin/settings"
            role="menuitem"
            data-menuitem
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-fg transition hover:bg-raised focus:bg-raised focus:outline-none"
          >
            Settings
          </Link>

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              data-menuitem
              className="block w-full px-3 py-2.5 text-left text-sm text-danger transition hover:bg-raised focus:bg-raised focus:outline-none"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
