import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";

export default async function CheckEmail({
  searchParams,
}: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell
      title="Check your email"
      footer={<Link href="/signin" className="text-[#4aa3ff] hover:underline">Back to sign in</Link>}
    >
      <p className="text-[13.5px] leading-relaxed text-[#a9adb5]">
        We sent a sign-in link{email ? <> to <span className="text-[#dfe1e5]">{email}</span></> : null}.
        It works once and expires in 15 minutes.
      </p>
      <p className="mt-4 rounded-lg border border-[#2b2d33] bg-[#101115] px-3.5 py-3 text-[12px] leading-relaxed text-[#6f747c]">
        Running locally? Email delivery is stubbed in development — the link is printed
        in the terminal running the dev server.
      </p>
    </AuthShell>
  );
}
