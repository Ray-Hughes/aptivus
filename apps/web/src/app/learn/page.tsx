import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { FLAGS, isEnabled } from "@/lib/flags";
import { userStats } from "@/lib/stats";
import { languageLabel, listTracks } from "@/lib/tracks";

export const metadata = {
  title: "Language tracks — Aptivus",
  description: "Learn a language for the job you are actually starting, not for a book's table of contents.",
};

export default async function LearnPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/learn");
  const userId = session.user.id;

  if (!(await isEnabled(FLAGS.languageTracks, userId))) notFound();

  const [tracks, stats] = await Promise.all([listTracks(userId), userStats(userId)]);

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-4xl px-5 py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-[26px] font-semibold tracking-tight">Language tracks</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9aa1ad]">
              A book teaches a language in the order the language makes sense. That is the wrong
              order for someone who starts on Monday. Tell us the job and what you already know,
              and we will teach the new language by comparison to the one you are fluent in —
              starting with the places your existing instinct will quietly betray you.
            </p>
          </div>
          <Link
            href="/learn/new"
            className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff] px-4 py-2 text-[13px] font-semibold text-[#04121a] transition hover:brightness-110"
          >
            New track
          </Link>
        </div>

        {tracks.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-8 text-center">
            <p className="text-[14px] text-[#c8ccd4]">No tracks yet.</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[#8b8f96]">
              Paste the job description you are aiming at. The roadmap is built against that,
              and every lesson has to justify why this job needs it.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {tracks.map((t) => {
              const pct = t.total ? Math.round((t.completed / t.total) * 100) : 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/learn/${t.id}`}
                    className="block rounded-xl border border-white/[0.08] bg-[#111318] p-5 transition hover:border-white/[0.16] hover:bg-[#14161c]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h2 className="text-[16px] font-semibold">
                        {languageLabel(t.targetLanguage)}{" "}
                        <span className="font-normal text-[#8b8f96]">for {t.jobTitle}</span>
                      </h2>
                      <span className="text-[12px] text-[#8b8f96]">
                        {t.completed} of {t.total} done
                      </span>
                    </div>
                    {t.knownLanguages?.length ? (
                      <p className="mt-1 text-[12.5px] text-[#6b727e]">
                        compared to {t.knownLanguages.map(languageLabel).join(", ")}
                      </p>
                    ) : null}
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
