"use client";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${className ?? ""}`}
      aria-hidden
    />
  );
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col h-[480px] rounded-[24px] border border-slate-200/70 bg-slate-50/60 overflow-hidden">
      <div className="flex items-center justify-between w-full px-5 py-4 border-b border-slate-200 bg-slate-100/80">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-[10px] shrink-0" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-7 w-8 rounded-lg shrink-0" />
      </div>
      <div className="flex flex-col gap-4 p-4 flex-1 min-h-0 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white p-4 rounded-[20px] border border-slate-100 flex flex-col gap-3 shrink-0"
          >
            <div className="flex justify-between items-start gap-2">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-5 w-14 rounded" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-28" />
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <Skeleton className="h-6 w-20 rounded-md" />
              <div className="flex gap-1">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-6 w-6 rounded-md" />
              </div>
            </div>
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-[16px] shrink-0 min-h-[44px]" />
      </div>
    </div>
  );
}

export function PipelineBoardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 pt-4">
      <div className="max-w-[1600px] mx-auto pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ColumnSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
