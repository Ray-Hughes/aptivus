import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const Body = z.object({
  displayName: z.string().max(80).optional(),
  targetCompany: z.string().max(120).nullable().optional(),
  targetRole: z.string().max(120).nullable().optional(),
  primaryLanguage: z.enum(["python", "javascript", "ruby", "sql"]).optional(),
  interviewDate: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { displayName, ...profile } = parsed.data;

  if (displayName !== undefined) {
    await db.update(users).set({ displayName }).where(eq(users.id, session.user.id));
  }
  if (Object.keys(profile).length) {
    await db
      .insert(profiles)
      .values({ userId: session.user.id, ...profile })
      .onConflictDoUpdate({ target: profiles.userId, set: profile });
  }
  return NextResponse.json({ ok: true });
}
