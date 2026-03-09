function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function PortalLoading() {
  return (
    <div className="p-4 space-y-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-monday-border bg-monday-surface p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-monday-border bg-monday-surface p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
