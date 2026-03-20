function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ""}`} />;
}

export default function ClientLoading() {
  return (
    <div className="space-y-8 p-2 sm:p-4 client-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-slate-100 bg-white p-6 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-40" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-[30px] border border-slate-100 bg-slate-900/90 p-8 space-y-4">
          <Skeleton className="h-4 w-36 bg-slate-700" />
          <Skeleton className="h-8 w-full bg-slate-700" />
          <Skeleton className="h-8 w-3/4 bg-slate-700" />
        </div>
        <div className="rounded-[30px] border border-slate-100 bg-white p-8 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
