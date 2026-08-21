import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { companies, profiles } from "@/db/schema";
import { summary } from "@/lib/entitlements";
import { normalizeExpertise } from "@/lib/expertise";
import { FLAGS, isEnabled } from "@/lib/flags";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/settings");

  const [profile, companyList, ent, billingOn] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1),
    db.select({ slug: companies.slug, name: companies.name }).from(companies)
      .where(eq(companies.isPublished, true)),
    summary(session.user.id),
    isEnabled(FLAGS.billing, session.user.id),
  ]);

  return (
    <main className="min-h-screen bg-[#0f1013] text-[#dfe1e5]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <a href="/dashboard" className="text-[13px] text-[#8b8f96] hover:text-[#dfe1e5]">
          &larr; Dashboard
        </a>
        <h1 className="mt-4 text-[26px] font-semibold tracking-tight">Settings</h1>
        <SettingsForm
          initialName={session.user.name ?? ""}
          initialCompany={profile[0]?.targetCompany ?? ""}
          initialRole={profile[0]?.targetRole ?? ""}
          initialLanguage={profile[0]?.primaryLanguage ?? "python"}
          initialExpertise={normalizeExpertise(profile[0]?.expertise)}
          companies={companyList}
        />

        <section className="mt-8 rounded-xl border border-[#24262b] bg-[#17181c] p-5">
          <h2 className="text-[15px] font-semibold">Plan</h2>
          <p className="mt-1.5 text-[13px] text-[#8b8f96]">
            {ent.pro
              ? "Pro — unlimited hints and solutions."
              : `Free — ${ent.hintsLeft} hints and ${ent.solutionsLeft} solutions left today. ${ent.gems} gems.`}
          </p>
          {billingOn ? (
            <a href="/api/billing/checkout"
               className="mt-4 inline-block rounded-lg bg-[#39c06c] px-4 py-2 text-[13.5px] font-semibold text-[#07230f]">
              {ent.pro ? "Manage subscription" : "Upgrade to Pro"}
            </a>
          ) : (
            <p className="mt-4 rounded-lg border border-[#2b2d33] bg-[#101115] px-3.5 py-2.5 text-[12.5px] text-[#6f747c]">
              Billing is not switched on yet. Everything is free while we build.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
