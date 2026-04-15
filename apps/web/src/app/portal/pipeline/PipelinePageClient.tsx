"use client";

import { useQuery } from "@tanstack/react-query";
import { getPipeline } from "@/app/actions/pipeline";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import { queryKeys } from "@/lib/query-keys";
import { PipelineBoardDynamic } from "@/app/dashboard/pipeline/PipelineBoardDynamic";
import type { ContactOption } from "@/app/dashboard/pipeline/PipelineBoard";

export function PipelinePageClient({
  initialStages,
  contacts,
}: {
  initialStages: StageWithOpportunities[];
  contacts: ContactOption[];
}) {
  const { data: stages = initialStages } = useQuery({
    queryKey: queryKeys.pipeline.board(),
    queryFn: () => getPipeline(),
    initialData: initialStages,
    staleTime: 30_000,
  });

  return <PipelineBoardDynamic stages={stages} contacts={contacts} />;
}
