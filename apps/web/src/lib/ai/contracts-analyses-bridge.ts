import type { ApplyResultPayload, ContractReviewRow } from "@/lib/ai/review-queue-repository";

export type ContractAnalysisBridgeSuggestion = {
  id: string;
  label: string;
  href: string;
  type: "analysis" | "service_action";
};

type PayloadWithBridge = ApplyResultPayload & {
  bridgeSuggestions?: ContractAnalysisBridgeSuggestion[];
};

function hasAnyContractArtifacts(payload: ApplyResultPayload | null | undefined) {
  if (!payload) return false;
  return Boolean(payload.createdContractId || payload.createdPaymentId || payload.createdTaskId);
}

export function mapContractReviewToBridgePayload(params: {
  review: ContractReviewRow;
  payload: ApplyResultPayload | null | undefined;
}): PayloadWithBridge {
  const base = params.payload ?? {};
  const suggestions: ContractAnalysisBridgeSuggestion[] = [];

  if (hasAnyContractArtifacts(base)) {
    suggestions.push({
      id: "open-analyses",
      label: "Otevřít finanční analýzy",
      href: "/portal/analyses",
      type: "analysis",
    });
    suggestions.push({
      id: "open-service-actions",
      label: "Založit servisní akci",
      href: "/portal/tasks?filter=service",
      type: "service_action",
    });
  }

  if ((params.review.reasonsForReview ?? []).length > 0) {
    suggestions.push({
      id: "review-warnings",
      label: "Zkontrolovat AI varování v detailu",
      href: `/portal/contracts/review/${params.review.id}`,
      type: "analysis",
    });
  }

  return {
    ...base,
    bridgeSuggestions: suggestions,
  };
}
