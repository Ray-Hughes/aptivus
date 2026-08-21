"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/5 p-6">
      <h2 className="text-base font-semibold text-danger">This page failed to load</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Something went wrong reading from the database. The error was logged on the
        server.
        {error.digest ? (
          <>
            {" "}
            Reference <code className="font-mono text-xs">{error.digest}</code>.
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-edge bg-raised px-3.5 py-2 text-sm transition hover:border-accent2"
      >
        Try again
      </button>
    </div>
  );
}
