import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { userStats } from "@/lib/stats";

export const metadata = { title: "Mock Interview — Aptivus" };

export default async function MockPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/mock");
  const stats = await userStats(session.user.id);

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-[28px] font-semibold tracking-tight">Mock Interview</h1>
        <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-relaxed text-[#9aa1ad]">
          One clock, two problems, no hints and no solutions — then a scorecard telling you
          where the time actually went.
        </p>
        <p className="mx-auto mt-6 max-w-lg rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-[13.5px] text-[#9aa1ad]">
          The screen is designed and being built. Until it lands, the honest substitute is to
          pick one SQL and one algorithms problem, set a 45 minute timer, and take no hints.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link href="/problems?kind=sql"
                className="rounded-xl border border-white/12 bg-white/[0.04] px-5 py-2.5 text-[13.5px] transition hover:bg-white/[0.09]">
            Browse SQL problems
          </Link>
          <Link href="/problems"
                className="rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#9E7BFF] px-5 py-2.5 text-[13.5px] font-semibold text-[#0b0c0f] transition hover:brightness-110">
            All problems
          </Link>
        </div>
      </main>
    </div>
  );
}
