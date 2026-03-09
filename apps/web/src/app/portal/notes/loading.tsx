function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function NotesLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-36" />

      {/* Form skeleton */}
      <div className="rounded-lg border border-monday-border bg-monday-surface p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-9 w-full rounded-[6px]" />
          <Skeleton className="h-9 w-full rounded-[6px]" />
        </div>
        <Skeleton className="h-9 w-full rounded-[6px]" />
        <Skeleton className="h-24 w-full rounded-[6px]" />
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28 rounded-[6px]" />
        </div>
      </div>

      {/* Notes list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-monday-border bg-monday-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
