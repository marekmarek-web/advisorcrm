function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function CalendarLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* Header with nav + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-[6px]" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-8 rounded-[6px]" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-8 w-16 rounded-[6px]" />
          <Skeleton className="h-8 w-16 rounded-[6px]" />
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px rounded-lg border border-monday-border bg-monday-border overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-monday-row-hover p-2 text-center">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}

        {/* Calendar day cells — 5 rows x 7 days */}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={`d${i}`} className="bg-monday-surface p-2 min-h-[80px] space-y-1">
            <Skeleton className="h-4 w-6" />
            {i % 4 === 0 && <Skeleton className="h-3 w-full" />}
            {i % 7 === 2 && <Skeleton className="h-3 w-3/4" />}
          </div>
        ))}
      </div>
    </div>
  );
}
