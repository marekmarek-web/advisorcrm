function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function TasksLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-24" />

      {/* Filter tabs */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-[6px]" />
        ))}
      </div>

      {/* Task table */}
      <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-monday-border bg-monday-row-hover">
              <th className="w-10 p-2"><Skeleton className="h-4 w-4 mx-auto" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="w-24 p-2" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-monday-border">
                <td className="p-2 text-center"><Skeleton className="h-4 w-4 mx-auto rounded" /></td>
                <td className="p-2"><Skeleton className="h-4 w-44" /></td>
                <td className="p-2"><Skeleton className="h-4 w-28" /></td>
                <td className="p-2"><Skeleton className="h-4 w-20" /></td>
                <td className="p-2">
                  <div className="flex gap-2 justify-end">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Quick-add skeleton */}
        <div className="flex items-center gap-2 p-3 border-t border-monday-border bg-monday-surface">
          <Skeleton className="flex-1 h-8 rounded-[6px]" />
          <Skeleton className="w-44 h-8 rounded-[6px]" />
          <Skeleton className="w-36 h-8 rounded-[6px]" />
          <Skeleton className="w-20 h-8 rounded-[6px]" />
        </div>
      </div>
    </div>
  );
}
