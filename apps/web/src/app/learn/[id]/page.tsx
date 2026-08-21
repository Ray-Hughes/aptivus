import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { FLAGS, isEnabled } from "@/lib/flags";
import { userStats } from "@/lib/stats";
import { languageLabel, loadOwnedTrack, loadTrackLessons } from "@/lib/tracks";

export const metadata = { title: "Track — Aptivus" };

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/learn/${id}`);
  const userId = session.user.id;
  if (!(await isEnabled(FLAGS.languageTracks, userId))) notFound();

  const track = await loadOwnedTrack(id, userId);
  if (!track) notFound();

  const [rows, stats] = await Promise.all([loadTrackLessons(id, userId), userStats(userId)]);
  const done = rows.filter((r) => r.progress?.status === "complete").length;
  const next = rows.find((r) => r.progress?.status !== "complete");

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-[#e6e8ec]">
      <AppHeader
        name={session.user.name} email={session.user.email}
        image={session.user.image} role={session.user.role}
        gems={stats.gems} streak={stats.streak}
      />

      <main className="mx-auto max-w-3xl px-5 py-9">
        <Link href="/learn" className="text-[13px] text-[#8b8f96] hover:text-[#e6e8ec]">
          &larr; Language tracks
        </Link>

        <h1 className="mt-4 text-[26px] font-semibold tracking-tight">
          {languageLabel(track.targetLanguage)}{" "}
          <span className="font-normal text-[#8b8f96]">for {track.jobTitle}</span>
        </h1>
        {track.knownLanguages?.length ? (
          <p className="mt-1.5 text-[13px] text-[#6b727e]">
            Taught by comparison to {track.knownLanguages.map(languageLabel).join(", ")}.
            {" "}{done} of {rows.length} lessons done.
          </p>
        ) : null}

        {track.rationale && (
          <section className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#4aa3ff]">
              Why this order
            </h2>
            <p className="mt-2 whitespace-pre-line text-[13.5px] leading-[1.7] text-[#c8ccd4]">
              {track.rationale}
            </p>
          </section>
        )}

        {next && (
          <Link
            href={`/learn/${id}/${next.lesson.id}`}
            className="mt-6 inline-block rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#4aa3ff] px-4 py-2.5 text-[13px] font-semibold text-[#04121a] transition hover:brightness-110"
          >
            {done === 0 ? "Start lesson 1" : `Continue — lesson ${next.lesson.position}`}
          </Link>
        )}

        <ol className="mt-7 space-y-2.5">
          {rows.map(({ lesson, progress }) => {
            const complete = progress?.status === "complete";
            return (
              <li key={lesson.id}>
                <Link
                  href={`/learn/${id}/${lesson.id}`}
                  className="flex gap-4 rounded-xl border border-white/[0.08] bg-[#111318] p-4 transition hover:border-white/[0.16] hover:bg-[#14161c]"
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                      complete
                        ? "bg-[#00E5FF]/15 text-[#00E5FF]"
                        : "bg-white/[0.06] text-[#8b8f96]"
                    }`}
                  >
                    {complete ? "✓" : lesson.position}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{lesson.title}</span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-[#8b8f96]">
                      {lesson.relevance}
                    </span>
                    <span className="mt-1.5 block text-[11.5px] text-[#5c626c]">
                      ~{lesson.estimatedMinutes} min
                      {progress?.solutionRevealed ? " · solution shown" : ""}
                      {!progress?.solutionRevealed && progress?.hintsUsed
                        ? ` · ${progress.hintsUsed} hint${progress.hintsUsed > 1 ? "s" : ""}`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
