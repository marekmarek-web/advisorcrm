function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

function KanbanColumnSkeleton() {
  return (
    <div className="flex-1 min-w-[240px] rounded-lg border border-monday-border bg-monday-surface p-3 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-monday-border bg-white p-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-14 rounded-[6px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PipelineLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-4 w-72" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <KanbanColumnSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
