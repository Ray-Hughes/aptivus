import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { safeNext } from "@/lib/admin";
import SignInForm from "./signin-form";

export const metadata = { title: "Sign in · Aptivus" };

export default async function SignInPage(props: PageProps<"/signin">) {
  const searchParams = await props.searchParams;
  const next = safeNext(searchParams.next, "/admin");

  const session = await auth();
  if (session?.user?.id) redirect(next);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="brand-bar mb-8 h-1 w-16 rounded-full" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to <span className="brand-text">Aptivus</span>
        </h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Admin access is granted by the seed script, never by signing up.
        </p>

        <div className="rounded-xl border border-edge bg-surface p-6">
          <SignInForm next={next} />
        </div>
      </div>
    </main>
  );
}
