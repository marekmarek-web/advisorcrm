function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-monday-border rounded ${className ?? ""}`} />;
}

export default function ContactDetailLoading() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 items-center">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-[6px]" />
      </div>
      <div className="flex gap-2 border-b border-monday-border pb-2">
        <Skeleton className="h-8 w-20 rounded-[6px]" />
        <Skeleton className="h-8 w-20 rounded-[6px]" />
        <Skeleton className="h-8 w-24 rounded-[6px]" />
      </div>
      <div className="rounded-xl border border-monday-border bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
