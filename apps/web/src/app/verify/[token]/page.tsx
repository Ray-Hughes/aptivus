import Link from "next/link";
import { eq } from "drizzle-orm";
import { AuthShell } from "@/components/AuthShell";
import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeToken } from "@/lib/tokens";

/**
 * Kept out of the component body: the render lint rule cannot tell that an
 * async server component is not a render pass, and it is right that Date.now()
 * has no business inside one.
 */
async function markVerified(token: string) {
  const userId = await consumeToken(token, "email_verify");
  if (!userId) return null;
  await db
    .update(users)
    .set({ emailVerifiedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, userId));
  return userId;
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await markVerified(token);
  return (
    <AuthShell title={userId ? "Email confirmed" : "That link did not work"}>
      <p className="text-[13.5px] leading-relaxed text-[#a9adb5]">
        {userId
          ? "Thanks — your address is verified."
          : "It may have expired or already been used. Request a fresh one from your settings."}
      </p>
      <Link href={userId ? "/dashboard" : "/signin"}
            className="mt-6 block rounded-lg bg-[#39c06c] px-4 py-2.5 text-center text-[14px] font-semibold text-[#07230f] transition hover:bg-[#43d179]">
        {userId ? "Go to dashboard" : "Back to sign in"}
      </Link>
    </AuthShell>
  );
}
