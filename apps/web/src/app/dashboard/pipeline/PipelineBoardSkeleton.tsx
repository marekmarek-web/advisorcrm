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
    <div
      className="flex flex-col min-h-0 rounded-[var(--wp-radius-sm)] border border-slate-200 bg-slate-50/50 overflow-hidden"
      style={{ minHeight: 360 }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between w-full p-5 rounded-t-2xl border-b border-slate-200 bg-slate-100/80">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-4 shrink-0" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>
      <div className="flex flex-col gap-4 p-4 flex-1 min-h-0">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white p-5 rounded-[var(--wp-radius-sm)] border border-slate-100 flex flex-col gap-3 shrink-0"
          >
            <div className="flex justify-between items-start gap-2">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-24" />
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <Skeleton className="h-6 w-24 rounded" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-[var(--wp-radius-sm)] shrink-0" />
      </div>
    </div>
  );
}

export function PipelineBoardSkeleton() {
  return (
    <>
      <style>{`
        .pipeline-board-grid { display: grid; grid-template-columns: repeat(3, minmax(340px, 1fr)); gap: 1.25rem; width: 100%; max-width: 100%; }
        @media (min-width: 1400px) { .pipeline-board-grid { grid-template-columns: repeat(3, minmax(380px, 1fr)); gap: 1.5rem; } }
        @media (max-width: 1024px) { .pipeline-board-grid { grid-template-columns: repeat(2, minmax(300px, 1fr)); } }
        @media (max-width: 640px)  { .pipeline-board-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div className="pipeline-board-grid pb-8 pt-2">
        {[1, 2, 3].map((i) => (
          <ColumnSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
