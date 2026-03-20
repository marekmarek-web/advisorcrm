export type AiAutomationSurface =
  | "portal_dashboard"
  | "portal_contact"
  | "portal_team"
  | "portal_business_plan"
  | "portal_meeting"
  | "client_portal";

export type AiAutomationSuggestion = {
  id: string;
  label: string;
  type: "open" | "create" | "assist";
  href?: string;
  payload?: Record<string, unknown>;
};

export type AiOrchestratedOutput = {
  summary: string;
  recommendations: string[];
  suggestedActions: AiAutomationSuggestion[];
  confidence: "high" | "medium" | "low";
  warnings: string[];
  meta: {
    surface: AiAutomationSurface;
    sources: string[];
  };
};

function splitToRecommendations(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*•\d.\s]+/, ""))
    .filter(Boolean)
    .slice(0, 4);
}

export function buildOrchestratedOutput(params: {
  surface: AiAutomationSurface;
  summaryText: string;
  recommendationText?: string | null;
  actionText?: string | null;
  sources: string[];
  warnings?: string[];
  suggestions?: AiAutomationSuggestion[];
}): AiOrchestratedOutput {
  const summary = params.summaryText.trim().slice(0, 2000);
  const recommendations = [
    ...splitToRecommendations(params.recommendationText ?? ""),
    ...splitToRecommendations(params.actionText ?? ""),
  ].slice(0, 5);

  const confidence: AiOrchestratedOutput["confidence"] =
    summary.length > 300 ? "high" : summary.length > 100 ? "medium" : "low";

  return {
    summary,
    recommendations,
    suggestedActions: params.suggestions ?? [],
    confidence,
    warnings: params.warnings ?? [],
    meta: {
      surface: params.surface,
      sources: params.sources,
    },
  };
}

export function collectGenerationErrors(results: Array<{ ok: boolean; error?: string }>): string[] {
  return results.filter((r) => !r.ok).map((r) => r.error ?? "Unknown generation error");
}
