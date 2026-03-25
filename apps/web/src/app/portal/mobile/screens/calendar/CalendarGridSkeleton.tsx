"use client";

export function CalendarGridSkeleton({ columnCount, timeColWidth }: { columnCount: number; timeColWidth: number }) {
  const cols = Math.max(1, columnCount);
  return (
    <div className="flex min-h-[320px] flex-1 animate-pulse flex-col border-t border-slate-100 bg-white">
      <div className="flex shrink-0 border-b border-slate-200">
        <div className="shrink-0 border-r border-slate-100" style={{ width: timeColWidth }} />
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 border-r border-slate-100 py-2 last:border-r-0">
            <div className="h-2 w-6 rounded bg-slate-200" />
            <div className="h-7 w-7 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="flex flex-1">
        <div className="shrink-0 space-y-0 border-r border-slate-100 py-2" style={{ width: timeColWidth }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-14 items-start justify-end pr-1">
              <div className="h-2 w-6 rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="space-y-2 border-r border-slate-100 p-1 last:border-r-0">
              <div className="ml-1 mt-6 h-10 rounded-lg bg-indigo-100/80" />
              <div className="ml-2 mt-4 h-8 rounded-lg bg-slate-200/80" />
              <div className="ml-1 mt-8 h-12 rounded-lg bg-emerald-100/80" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
