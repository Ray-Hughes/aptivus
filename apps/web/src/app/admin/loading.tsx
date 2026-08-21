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
