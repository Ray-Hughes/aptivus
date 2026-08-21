import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens } from "@/db/schema";

export type TokenKind = "password_reset" | "email_verify";
const TTL_SECONDS = 15 * 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const nowSec = () => Math.floor(Date.now() / 1000);

/** Returns the plaintext token exactly once; only its hash is persisted. */
export async function issueToken(userId: string, kind: TokenKind, ip?: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({
    userId,
    kind,
    tokenHash: sha256(token),
    expiresAt: nowSec() + TTL_SECONDS,
    createdIp: ip,
  });
  return token;
}

/** Single use: consuming marks it spent, so a replayed link does nothing. */
export async function consumeToken(token: string, kind: TokenKind) {
  const digest = sha256(token);
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, digest),
        eq(authTokens.kind, kind),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, nowSec()),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Constant-time compare on the way out as well, cheap insurance.
  const a = Buffer.from(row.tokenHash);
  const b = Buffer.from(digest);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  await db
    .update(authTokens)
    .set({ consumedAt: nowSec() })
    .where(eq(authTokens.id, row.id));
  return row.userId;
}

/** Called on password change: outstanding reset links must stop working. */
export async function revokeTokens(userId: string, kind: TokenKind) {
  await db
    .update(authTokens)
    .set({ consumedAt: nowSec() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.consumedAt)));
}
