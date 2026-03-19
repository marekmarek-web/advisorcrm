import { PipelineBoardSkeleton } from "@/app/dashboard/pipeline/PipelineBoardSkeleton";

export default function PipelineLoading() {
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-[#f8fafc]">
      <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 lg:px-8 pb-4 w-full">
        <div className="py-6 flex justify-between items-end gap-4 border-b border-slate-100 shrink-0 bg-white rounded-t-xl">
          <div>
            <div className="h-8 w-64 animate-pulse rounded bg-slate-200 mb-2" />
            <div className="flex items-center gap-3 mt-2">
              <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-11 w-36 animate-pulse rounded-xl bg-slate-100 shrink-0" />
        </div>
        <div className="flex justify-between gap-3 py-4 shrink-0">
          <div className="h-11 max-w-md w-full animate-pulse rounded-xl bg-slate-100" />
          <div className="flex gap-3">
            <div className="h-11 w-40 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-11 w-32 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
        <PipelineBoardSkeleton />
      </div>
    </div>
  );
}
