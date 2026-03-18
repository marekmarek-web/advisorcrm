import type { AiActionSuggestion } from "./action-suggestions";

export type ActionValidationResult = {
  valid: boolean;
  warnings: string[];
  sanitized: AiActionSuggestion;
};

function toIsoOrNull(input?: string): string | undefined {
  if (!input) return undefined;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function validateActionSuggestion(suggestion: AiActionSuggestion): ActionValidationResult {
  const warnings: string[] = [];
  const rawTitle = suggestion.title?.trim() ?? "";
  const title = rawTitle.slice(0, 200);

  if (!rawTitle) {
    warnings.push("Chybí název akce.");
  }
  if (rawTitle.length > 200) {
    warnings.push("Název byl zkrácen na 200 znaků.");
  }

  let dueAt = toIsoOrNull(suggestion.dueAt);
  if (suggestion.dueAt && !dueAt) {
    warnings.push("Neplatné datum bylo odstraněno.");
  }

  let caseType = suggestion.caseType?.trim() || undefined;
  if (suggestion.actionType === "deal" && !caseType) {
    caseType = "jiné";
    warnings.push("Obchod bez oblasti byl nastaven na 'jiné'.");
  }

  if (suggestion.actionType === "meeting" && !dueAt) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    dueAt = defaultDate.toISOString();
    warnings.push("Schůzka bez termínu dostala výchozí termín za 7 dní.");
  }

  let normalizedTitle = title;
  if (
    suggestion.actionType === "service_action" &&
    normalizedTitle &&
    !normalizedTitle.toLowerCase().startsWith("[servis]")
  ) {
    normalizedTitle = `[Servis] ${normalizedTitle}`;
  }

  const sanitized: AiActionSuggestion = {
    ...suggestion,
    title: normalizedTitle,
    dueAt,
    caseType,
  };

  return {
    valid: Boolean(normalizedTitle),
    warnings,
    sanitized,
  };
}
