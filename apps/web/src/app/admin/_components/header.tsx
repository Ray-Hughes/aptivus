"use client";

import { usePathname } from "next/navigation";
import AvatarMenu, { type AvatarUser } from "./avatar-menu";
import { pageTitle } from "./nav";

export default function AdminHeader({ user }: { user: AvatarUser }) {
  const pathname = usePathname() ?? "/admin";

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-edge bg-ink/90 px-6 backdrop-blur">
      <h1 className="truncate text-base font-semibold tracking-tight">
        {pageTitle(pathname)}
      </h1>
      <AvatarMenu user={user} />
    </header>
  );
}
