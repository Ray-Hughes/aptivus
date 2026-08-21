import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { sendVerifyEmail } from "@/lib/email";
import { hashPassword, passwordProblem } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { issueToken } from "@/lib/tokens";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  displayName: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`signup:${ip}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check your details." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const problem = passwordProblem(parsed.data.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    // Do not confirm that an address is registered. Tell the owner instead.
    const token = await issueToken(existing.id, "password_reset", ip);
    await sendVerifyEmail(email, `${process.env.AUTH_URL}/reset/${token}`);
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: parsed.data.displayName?.trim() || null })
    .returning({ id: users.id });
  await db.insert(profiles).values({ userId: user.id }).onConflictDoNothing();

  const token = await issueToken(user.id, "email_verify", ip);
  await sendVerifyEmail(email, `${process.env.AUTH_URL}/verify/${token}`);
  return NextResponse.json({ ok: true });
}
