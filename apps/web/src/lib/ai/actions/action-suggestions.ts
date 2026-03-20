export type AiActionType = "task" | "meeting" | "deal" | "service_action";

export type AiActionSuggestion = {
  actionType: AiActionType;
  title: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  targetEntityType?: "contact" | "event" | "opportunity" | "meeting_note";
  targetEntityId?: string;
  dueAt?: string;
  ownerId?: string;
  caseType?: string;
  duplicateRisk?: "none" | "possible" | "likely";
  existingItemId?: string;
  sourceGenerationId: string;
  sourcePromptType: string;
  confidence?: "high" | "medium" | "low";
};

export type AiActionSuggestionSet = {
  suggestions: AiActionSuggestion[];
  generationId: string;
  promptType: string;
  contactId: string;
};

export type AiActionExecutionResult =
  | {
      ok: true;
      entityId: string;
      entityType: "task" | "event" | "opportunity";
      duplicateWarning?: string;
      warnings?: string[];
    }
  | {
      ok: false;
      error: string;
      warnings?: string[];
      code?: "DUPLICATE_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "FORBIDDEN";
      conflict?: {
        duplicateRisk: "none" | "possible" | "likely";
        existingItems: Array<{ type: "task" | "event" | "opportunity"; id: string; title: string }>;
      };
    };
