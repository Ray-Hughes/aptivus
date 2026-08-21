import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { COST, summary } from "@/lib/entitlements";
import { FLAGS, isEnabled } from "@/lib/flags";
import { userStats } from "@/lib/stats";
import { availablePairs } from "@/lib/transitions";
import { TARGETABLE, languageLabel } from "@/lib/tracks";
import { NewTrackForm } from "./NewTrackForm";

export const metadata = { title: "New language track — Aptivus" };

export default async function NewTrackPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/learn/new");
  const userId = session.user.id;
  if (!(await isEnabled(FLAGS.languageTracks, userId))) notFound();

  const [[profile], stats, ent] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    userStats(userId),
    summary(userId),
  ]);

  const expertise = profile?.expertise ?? [];
  const known = expertise.length
    ? expertise.map((e) => e.language)
    : [profile?.primaryLanguage ?? "python"];

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />
      <main className="mx-auto max-w-2xl px-5 py-9">
        <Link href="/learn" className="text-[13px] text-[#8b8f96] hover:text-[#e6e8ec]">
          &larr; Language tracks
        </Link>
        <h1 className="mt-4 text-[26px] font-semibold tracking-tight">New track</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9aa1ad]">
          The more of the real job you paste in, the less generic the roadmap. A job description
          works well; so does &ldquo;we run Go services behind gRPC and I will be on call&rdquo;.
        </p>

        <NewTrackForm
          targets={TARGETABLE.map((t) => ({ slug: t, label: languageLabel(t) }))}
          known={known}
          knownLabels={Object.fromEntries(known.map((k) => [k, languageLabel(k)]))}
          mappedPairs={availablePairs()}
          hasExpertise={expertise.length > 0}
          pro={ent.pro}
          gems={ent.gems}
          cost={COST.generation}
        />
      </main>
    </div>
  );
}
