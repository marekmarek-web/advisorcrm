import type { PromptType } from "@/lib/ai/prompt-registry";
import type { ContextCompleteness } from "@/lib/ai/context/completeness";

type GuardrailParams = {
  promptType: PromptType;
  outputText: string;
  variables?: Record<string, string>;
  completeness?: ContextCompleteness | null;
  activeDealTitles?: string[];
};

const SPECULATIVE_PATTERNS = [
  "klient nereaguje",
  "klient odmítá",
  "klient nemá zájem",
  "psychologicky",
  "emocionálně",
  "vnitřní motivace",
];

function hasEvidenceInVariables(
  phrase: string,
  variables: Record<string, string> | undefined
): boolean {
  if (!variables) return false;
  const haystack = Object.values(variables).join("\n").toLowerCase();
  return haystack.includes(phrase.toLowerCase());
}

function overlapsWithActiveDeals(outputText: string, activeDealTitles: string[]): boolean {
  const normalized = outputText.toLowerCase();
  return activeDealTitles
    .map((title) => title.trim().toLowerCase())
    .filter((title) => title.length >= 4)
    .some((title) => normalized.includes(title));
}

export function applyOutputGuardrails(params: GuardrailParams): string {
  let next = params.outputText ?? "";
  const warnings: string[] = [];

  const speculative = SPECULATIVE_PATTERNS.filter(
    (pattern) => next.toLowerCase().includes(pattern) && !hasEvidenceInVariables(pattern, params.variables)
  );
  if (speculative.length > 0) {
    warnings.push("Některé závěry mohou být spekulativní. Ověřte je přímo s klientem.");
  }

  if (
    params.promptType === "clientOpportunities" &&
    params.activeDealTitles &&
    overlapsWithActiveDeals(next, params.activeDealTitles)
  ) {
    warnings.push("Některé zmíněné oblasti se mohou překrývat s již otevřenými obchody.");
  }

  if (params.completeness?.overall === "low" && !next.toLowerCase().includes("neúpln")) {
    next = `Na základě neúplných dat:\n\n${next}`;
  }

  if (warnings.length > 0) {
    next = `${next}\n\n[Upozornění: ${warnings.join(" ")}]`;
  }

  return next;
}
