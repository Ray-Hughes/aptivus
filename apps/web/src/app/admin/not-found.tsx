import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="rounded-xl border border-edge bg-surface p-8 text-center">
      <p className="text-3xl font-semibold">404</p>
      <h2 className="mt-2 text-base font-medium">That record does not exist</h2>
      <p className="mt-2 text-sm text-muted">
        It may have been deleted, or the id in the URL is wrong.
      </p>
      <Link
        href="/admin"
        className="mt-6 inline-block rounded-md border border-edge bg-raised px-4 py-2 text-sm transition hover:border-accent2"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
