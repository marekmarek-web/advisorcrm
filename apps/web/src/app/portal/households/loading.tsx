function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function HouseholdsLoading() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-36" />

      <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-monday-border bg-monday-row-hover">
              <th className="text-left p-2"><Skeleton className="h-4 w-24" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-20" /></th>
              <th className="p-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-monday-border">
                <td className="p-2"><Skeleton className="h-4 w-36" /></td>
                <td className="p-2"><Skeleton className="h-4 w-8" /></td>
                <td className="p-2"><Skeleton className="h-4 w-24" /></td>
                <td className="p-2"><Skeleton className="h-4 w-12" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
