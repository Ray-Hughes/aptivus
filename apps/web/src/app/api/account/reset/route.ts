import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, passwordProblem } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { consumeToken, revokeTokens } from "@/lib/tokens";

const Body = z.object({ token: z.string().min(10).max(500), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const problem = passwordProblem(parsed.data.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const userId = await consumeToken(parsed.data.token, "password_reset");
  if (!userId) {
    return NextResponse.json({ error: "That link has expired or already been used." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, userId));
  // Any other outstanding reset links must stop working.
  await revokeTokens(userId, "password_reset");
  return NextResponse.json({ ok: true });
}
