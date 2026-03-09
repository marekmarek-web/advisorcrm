function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function ClientLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72" />

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-monday-border bg-monday-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
      ))}

      <div className="rounded-xl border border-monday-border bg-monday-surface p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
