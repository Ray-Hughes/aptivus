export type NavIcon =
  | "dashboard"
  | "users"
  | "problems"
  | "companies"
  | "payments"
  | "flags"
  | "achievements"
  | "audit";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

export const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/problems", label: "Problems", icon: "problems" },
  { href: "/admin/companies", label: "Companies", icon: "companies" },
  { href: "/admin/payments", label: "Payments", icon: "payments" },
  { href: "/admin/flags", label: "Feature Flags", icon: "flags" },
  { href: "/admin/achievements", label: "Achievements", icon: "achievements" },
  { href: "/admin/audit", label: "Audit Log", icon: "audit" },
];

/** Longest-prefix match, so /admin/users/abc still highlights Users. */
export function activeItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

export function pageTitle(pathname: string): string {
  if (pathname === "/admin/settings") return "Settings";
  return activeItem(pathname)?.label ?? "Admin";
}
