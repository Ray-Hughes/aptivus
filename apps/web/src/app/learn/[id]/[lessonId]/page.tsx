import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { trackLessons } from "@/db/schema";
import { summary } from "@/lib/entitlements";
import { FLAGS, isEnabled } from "@/lib/flags";
import { languageLabel, loadOwnedLesson } from "@/lib/tracks";
import { LessonPlayer } from "./LessonPlayer";

export const metadata = { title: "Lesson — Aptivus" };

/**
 * The page renders the shell and the client fetches the lesson, because the
 * first person to open a lesson triggers it being written and verified. That
 * is a slow thing with a visible reason, and "writing this lesson" is a much
 * better experience than a blank tab holding a server render open.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const session = await auth();
  const { id, lessonId } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/learn/${id}/${lessonId}`);
  const userId = session.user.id;
  if (!(await isEnabled(FLAGS.languageTracks, userId))) notFound();

  const found = await loadOwnedLesson(lessonId, userId);
  if (!found) notFound();

  const [siblings, ent] = await Promise.all([
    db.select({ id: trackLessons.id, position: trackLessons.position })
      .from(trackLessons)
      .where(eq(trackLessons.trackId, found.track.id))
      .orderBy(asc(trackLessons.position)),
    summary(userId),
  ]);
  const at = siblings.findIndex((s) => s.id === lessonId);

  return (
    <LessonPlayer
      trackId={id}
      lessonId={lessonId}
      title={found.lesson.title}
      relevance={found.lesson.relevance}
      position={found.lesson.position}
      total={siblings.length}
      nextId={siblings[at + 1]?.id ?? null}
      language={found.track.targetLanguage}
      languageLabel={languageLabel(found.track.targetLanguage)}
      knownLabel={(found.track.knownLanguages ?? []).map(languageLabel).join(", ")}
      jobTitle={found.track.jobTitle}
      pro={ent.pro}
      gems={ent.gems}
    />
  );
}
