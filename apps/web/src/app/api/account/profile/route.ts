import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { isResponse, json, readBody, unauthorized } from "@/lib/api";
import { EXPERTISE_LANGUAGES, EXPERTISE_LEVELS } from "@/lib/expertise";

/**
 * The browser sends whatever its dropdowns happen to hold, so the allowed
 * languages and levels are re-derived here from the same constants the editor
 * renders from - never taken from the request.
 */
const Expertise = z
  .array(z.object({
    language: z.enum(EXPERTISE_LANGUAGES),
    level: z.enum(EXPERTISE_LEVELS),
  }))
  // One entry per language at most, so the list can never be longer than the
  // set of languages we offer.
  .max(EXPERTISE_LANGUAGES.length)
  .refine(
    (rows) => new Set(rows.map((r) => r.language)).size === rows.length,
    { message: "Each language may only appear once." },
  );

const Body = z.object({
  displayName: z.string().max(80).optional(),
  targetCompany: z.string().max(120).nullable().optional(),
  targetRole: z.string().max(120).nullable().optional(),
  primaryLanguage: z.enum(["python", "javascript", "ruby", "sql"]).optional(),
  expertise: Expertise.optional(),
  interviewDate: z.number().int().nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await readBody(request, Body);
  if (isResponse(body)) return body;
  const { displayName, ...profile } = body;

  if (displayName !== undefined) {
    await db.update(users).set({ displayName }).where(eq(users.id, session.user.id));
  }
  if (Object.keys(profile).length) {
    await db
      .insert(profiles)
      .values({ userId: session.user.id, ...profile })
      .onConflictDoUpdate({ target: profiles.userId, set: profile });
  }
  return json({ ok: true });
}
