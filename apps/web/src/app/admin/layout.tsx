import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin";
import AdminHeader from "./_components/header";
import Sidebar from "./_components/sidebar";

export const metadata: Metadata = { title: "Admin · Aptivus" };

// The panel reads live rows on every request; caching it would be actively
// misleading for an operator.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Guard #1 of 2. Every page underneath calls requireAdminPage() again, and
  // every mutation calls requireAdminApi(). The layout check is convenience,
  // not the security boundary.
  const admin = await requireAdminPage();

  return (
    <div className="flex min-h-dvh w-full bg-ink text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          user={{
            name: admin.name ?? null,
            email: admin.email,
            image: admin.image ?? null,
          }}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
