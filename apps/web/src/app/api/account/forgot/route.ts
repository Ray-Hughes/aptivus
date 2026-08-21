import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendPasswordReset } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { siteOrigin } from "@/lib/origin";
import { issueToken } from "@/lib/tokens";

const Body = z.object({ email: z.string().email().max(254) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  // Identical response in every branch: existence of an account must not leak.
  const same = NextResponse.json({ ok: true });
  if (!parsed.success) return same;

  const email = parsed.data.email.trim().toLowerCase();
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000).ok) return same;
  if (!rateLimit(`forgot:${email}`, 3, 15 * 60_000).ok) return same;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const token = await issueToken(user.id, "password_reset", ip);
    await sendPasswordReset(email, `${await siteOrigin()}/reset/${token}`);
  }
  return same;
}
