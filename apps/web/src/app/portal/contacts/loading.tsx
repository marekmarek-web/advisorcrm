function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function ContactsLoading() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-36 rounded-[6px]" />
      </div>

      <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-monday-border bg-monday-row-hover">
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="text-left p-2"><Skeleton className="h-4 w-16" /></th>
              <th className="p-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-monday-border">
                <td className="p-2"><Skeleton className="h-4 w-32" /></td>
                <td className="p-2"><Skeleton className="h-4 w-40" /></td>
                <td className="p-2"><Skeleton className="h-4 w-28" /></td>
                <td className="p-2"><Skeleton className="h-4 w-12" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
