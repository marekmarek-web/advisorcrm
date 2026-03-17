import { PipelineBoardSkeleton } from "@/app/dashboard/pipeline/PipelineBoardSkeleton";

export default function PipelineLoading() {
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="flex items-center justify-between px-4 py-4 shrink-0">
        <div>
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-72 mt-2 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4 w-full">
        <PipelineBoardSkeleton />
      </div>
    </div>
  );
}
