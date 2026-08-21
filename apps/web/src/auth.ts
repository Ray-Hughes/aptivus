import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sendMagicLink } from "@/lib/email";
import { assertProductionConfig } from "@/lib/config-guard";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { verifyPassword } from "@/lib/password";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string; email: string; name?: string | null; image?: string | null };
  }
}

assertProductionConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users as never,
    accountsTable: accounts as never,
    sessionsTable: sessions as never,
    verificationTokensTable: verificationTokens as never,
  }),
  // Pinned rather than inferred. next-auth derives basePath from AUTH_URL's
  // pathname, so an AUTH_URL carrying any path other than "/" silently makes
  // every /api/auth/* route reject with "Bad request." - and every auth route
  // fails identically, which reads like a broken deployment rather than a
  // misconfigured variable.
  basePath: "/api/auth",
  // JWT sessions: the Credentials provider cannot use database sessions.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin", verifyRequest: "/signin/check-email" },
  trustHost: true,
  providers: [
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;

        // Password sign-in is the one endpoint worth brute forcing.
        //
        // The per-IP limit is the tight one, because that is where an attacker
        // actually is. The per-account limit is deliberately loose: a strict
        // one lets anybody lock a victim out of their own account just by
        // guessing wrong at their address, turning a defense into a denial of
        // service. It is a backstop against a distributed attempt, not the
        // primary control.
        const ip = request instanceof Request ? clientIp(request) : "unknown";
        if (!rateLimit(`signin:ip:${ip}`, 10, 15 * 60_000).ok) return null;
        if (!rateLimit(`signin:acct:${email}`, 50, 60 * 60_000).ok) return null;
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        // verifyPassword still hashes when there is no stored digest, so a
        // missing account and a wrong password take the same time.
        const ok = await verifyPassword(user?.passwordHash ?? null, password);
        if (!ok || !user || user.deletedAt) return null;
        return { id: user.id, email: user.email, name: user.displayName, image: user.image };
      },
    }),
    {
      // Passwordless sign-in. Auth.js stores a hashed token itself.
      id: "email",
      type: "email",
      name: "Email link",
      from: process.env.EMAIL_FROM ?? "Aptivus <hello@aptivus.dev>",
      maxAge: 15 * 60,
      options: {},
      async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
        await sendMagicLink(identifier, url);
      },
    } as never,
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (token.uid) {
        const [row] = await db
          .select({
            role: users.role,
            email: users.email,
            name: users.displayName,
            image: users.image,
            deletedAt: users.deletedAt,
          })
          .from(users)
          .where(eq(users.id, String(token.uid)))
          .limit(1);
        // Re-read on every request so a demotion or a soft delete takes effect
        // on the next page load rather than whenever the 30-day JWT expires.
        // Returning null invalidates the session.
        if (!row || row.deletedAt) return null;
        token.role = row.role;
        token.email = row.email;
        token.name = row.name;
        token.picture = row.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user = {
          ...session.user,
          id: String(token.uid),
          role: String(token.role ?? "user"),
          email: String(token.email ?? ""),
          name: token.name as string | null,
          image: token.picture as string | null,
        };
      }
      return session;
    },
  },
});

/** Route-handler guard: returns the session or throws a 401-shaped error. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Response("Unauthorized", { status: 401 });
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return user;
}
