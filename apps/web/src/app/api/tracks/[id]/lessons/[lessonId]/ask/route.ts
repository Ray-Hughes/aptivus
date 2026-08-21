/**
 * POST .../ask - the learner asks about the lesson in front of them.
 *
 * The model gets the teaching, the task and the learner's own code, so the
 * answer is about THIS code rather than generic advice. It is told to explain
 * rather than hand over the answer: a free "just write it for me" button would
 * quietly replace the product with a worse chat window.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { fail, isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { failureMessage, generateText } from "@/lib/ai";
import { rateLimit } from "@/lib/ratelimit";
import { ensureLessonWritten, languageLabel, loadOwnedLesson } from "@/lib/tracks";

const Body = z.object({
  question: z.string().trim().min(3).max(1000),
  code: z.string().max(20_000).optional(),
});

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const gate = rateLimit(`ask:${session.user.id}`, 20, 10 * 60 * 1000);
  if (!gate.ok) return fail(429, "Slow down a moment - try again shortly.");

  const { lessonId } = await params;
  const found = await loadOwnedLesson(lessonId, session.user.id);
  if (!found) return notFound("No such lesson.");

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const written = await ensureLessonWritten(found.lesson, found.track);
  if (!written.ok) return fail(503, written.message);

  const target = languageLabel(found.track.targetLanguage);
  const known = (found.track.knownLanguages ?? []).map(languageLabel).join(", ");

  const answer = await generateText({
    system:
      `You are helping an experienced engineer who is fluent in ${known || "another language"} ` +
      `learn ${target} for a specific job. Explain; do not solve. If they are one step from ` +
      `the answer you may confirm the step, but never write their exercise for them - the ` +
      `Solution button exists for that and it costs them something, which is the point. ` +
      `When their confusion comes from a ${known || "prior-language"} habit, name the habit. ` +
      `Be brief: a few sentences, or a short snippet illustrating the IDEA rather than the answer.`,
    prompt: `
The lesson they are reading:
${written.lesson.teaching}

The exercise:
${written.lesson.scaffold}

Their code right now:
${body.code?.trim() || "(they have not written anything yet)"}

Their question:
${body.question}
`.trim(),
    maxTokens: 1400,
  });

  if (!answer.ok) return fail(503, failureMessage(answer.failure));
  return json({ answer: answer.value });
}
