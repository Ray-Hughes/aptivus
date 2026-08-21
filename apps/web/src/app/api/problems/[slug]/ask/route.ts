/**
 * POST /api/problems/[slug]/ask - explain this, here, now.
 *
 * The thing that makes an explanation useful is that it is about YOUR code at
 * the line YOU are stuck on, so this takes the learner's code and, when they
 * are mid-trace, the actual line and the actual variable values at that step.
 * "What does `stack.pop() != pairs[ch]` mean" answered against real values
 * beats any amount of correct general prose.
 *
 * It explains and refuses to solve. Two reasons, and the second is the real
 * one: a free "write it for me" button would make the metered Solution
 * pointless, and someone who reads the answer here learns nothing, which is
 * the entire thing they came for.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { failureMessage, generateText } from "@/lib/ai";
import { fail, isResponse, json, notFound, readBody, unauthorized } from "@/lib/api";
import { FLAGS, isEnabled } from "@/lib/flags";
import { lockedByLiveRound } from "@/lib/mock";
import { findProblem } from "@/lib/problems";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  question: z.string().trim().min(3).max(1000),
  code: z.string().max(20_000).default(""),
  language: z.string().max(20).default("python"),
  // Present only when they are stepping through a trace.
  at: z
    .object({
      line: z.number().int().nonnegative(),
      source: z.string().max(400),
      func: z.string().max(80),
      locals: z.array(z.tuple([z.string().max(80), z.string().max(400)])).max(30),
    })
    .optional(),
});

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  if (!(await isEnabled(FLAGS.coach, userId))) return fail(404, "Not found.");

  const { slug } = await params;
  const found = await findProblem(slug);
  if (!found) return notFound("No such problem.");

  // The same promise the Hint button makes during a mock round. A coach that
  // still answers mid-interview would just be a hint button with a nicer name,
  // and the pre-round screen would be lying.
  if (await lockedByLiveRound(userId, found.row.id)) {
    return fail(403, "Not during a mock round. That was the deal - the round ends, then we talk.");
  }

  const gate = rateLimit(`ask:${userId}`, 20, 10 * 60 * 1000);
  if (!gate.ok) return fail(429, "Give it a minute - too many questions at once.");

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;

  const where = body.at
    ? `
They are stepping through their own code and are paused here:

  line ${body.at.line} in ${body.at.func}:  ${body.at.source.trim()}

The variables at this exact moment:
${body.at.locals.map(([k, v]) => `  ${k} = ${v}`).join("\n") || "  (none yet)"}

Answer about THIS moment. Use these real values, not invented ones.`
    : "";

  const answer = await generateText({
    system:
      "You are explaining a coding problem to an experienced engineer who is stuck on a " +
      "specific thing. Answer the question they asked and stop. Do not restate the problem, " +
      "do not review their style, do not list the approaches they did not take. " +
      "NEVER write the working solution or the missing line - if they are one step away, " +
      "name what the step needs to accomplish, not the code that does it. " +
      "There is a Solution button that costs them something; that is where answers live. " +
      "Concrete beats general: trace a real value through rather than describing what the " +
      "code does in the abstract. A few sentences, or a tiny snippet showing the IDEA.",
    prompt: `
Problem: ${found.row.title}

${found.body.prompt}

Their ${body.language} code:
\`\`\`
${body.code.trim() || "(empty)"}
\`\`\`
${where}

Their question:
${body.question}
`.trim(),
    maxTokens: 1200,
  });

  if (!answer.ok) return fail(503, failureMessage(answer.failure));
  return json({ answer: answer.value });
}
