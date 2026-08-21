import Link from "next/link";

/**
 * Rendered whenever a Server Component calls forbidden(). A signed-in user who
 * is not an admin lands here with a 403 and stays put.
 */
export default function Forbidden() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <p className="brand-text text-6xl font-bold tracking-tight">403</p>
        <h1 className="mt-4 text-xl font-semibold">Not your area</h1>
        <p className="mt-3 text-sm text-muted">
          You are signed in, but this account does not have the admin role. There is
          no way to grant it from the web: admins are promoted with the seed script
          or the CLI.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-md border border-edge bg-surface px-4 py-2 text-sm transition hover:border-accent2"
        >
          Back to Aptivus
        </Link>
      </div>
    </main>
  );
}
