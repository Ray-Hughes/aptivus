/**
 * Route-level loading UI for every admin page.
 *
 * Trade-off worth knowing: a loading.tsx puts the whole segment behind a
 * Suspense boundary, so the shell is flushed with a 200 before the page runs.
 * A later notFound() therefore renders the 404 UI but cannot change the status
 * code. Delete this file if a true 404 status matters more than the skeleton.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 animate-pulse rounded-md bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
