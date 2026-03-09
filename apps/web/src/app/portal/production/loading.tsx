function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function ProductionLoading() {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <div className="flex gap-1">
          <Skeleton className="h-8 w-20 rounded-[6px]" />
          <Skeleton className="h-8 w-20 rounded-[6px]" />
          <Skeleton className="h-8 w-20 rounded-[6px]" />
        </div>
      </div>
      <div className="flex gap-6 flex-wrap">
        <div className="rounded-lg border border-monday-border bg-monday-surface p-6">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-[200px] w-[200px] rounded-full" />
        </div>
        <div className="flex-1 min-w-[280px] rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
          <div className="border-b border-monday-border p-3 flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 border-b border-monday-border">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
