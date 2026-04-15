"use client";

import dynamic from "next/dynamic";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import { PipelineBoardSkeleton } from "./PipelineBoardSkeleton";
import type { ContactOption } from "./PipelineBoard";

export type PipelineBoardDynamicProps = {
  stages: StageWithOpportunities[];
  contacts?: ContactOption[];
  contactContext?: { contactId: string };
  onMutationComplete?: () => void;
  initialOpenCreateStageId?: string | null;
  onOpenCreateConsumed?: () => void;
  /** Jen prohlížení — bez zakládání, přesunů a úprav (např. chybí opportunities:write). */
  readOnly?: boolean;
};

const PipelineBoard = dynamic(
  () => import("./PipelineBoard").then((m) => m.PipelineBoard),
  {
    ssr: false,
    loading: () => <PipelineBoardSkeleton />,
  },
);

/** Code-splits the heavy pipeline board (DnD, modals) from the route shell. */
export function PipelineBoardDynamic(props: PipelineBoardDynamicProps) {
  return <PipelineBoard {...props} />;
}
