/**
 * Centralized prompt registry: maps internal prompt types to env-configured
 * OpenAI Prompt Builder IDs. No hardcoded prompt IDs in components.
 */

export type PromptType =
  | "clientSummary"
  | "clientOpportunities"
  | "nextBestAction"
  | "preMeetingBriefing"
  | "postMeetingFollowup"
  | "teamSummary";

const ENV_KEYS: Record<PromptType, string> = {
  clientSummary: "OPENAI_PROMPT_CLIENT_SUMMARY_ID",
  clientOpportunities: "OPENAI_PROMPT_CLIENT_OPPORTUNITIES_ID",
  nextBestAction: "OPENAI_PROMPT_NEXT_BEST_ACTION_ID",
  preMeetingBriefing: "OPENAI_PROMPT_PRE_MEETING_BRIEFING_ID",
  postMeetingFollowup: "OPENAI_PROMPT_POST_MEETING_FOLLOWUP_ID",
  teamSummary: "OPENAI_PROMPT_TEAM_SUMMARY_ID",
};

/** Per-prompt version env key pattern (e.g. OPENAI_PROMPT_CLIENT_SUMMARY_VERSION). */
function getVersionEnvKey(type: PromptType): string {
  const base = ENV_KEYS[type].replace("_ID", "");
  return `${base}_VERSION`;
}

/**
 * Returns the OpenAI Prompt Builder prompt ID for the given type.
 * Reads from process.env; returns null if not set.
 */
export function getPromptId(type: PromptType): string | null {
  const key = ENV_KEYS[type];
  const value = process.env[key]?.trim();
  return value || null;
}

/**
 * Returns the prompt version for the given type.
 * First checks type-specific env (e.g. OPENAI_PROMPT_CLIENT_SUMMARY_VERSION),
 * then falls back to OPENAI_PROMPT_VERSION.
 */
export function getPromptVersion(type: PromptType): string | null {
  const specificKey = getVersionEnvKey(type);
  const specific = process.env[specificKey]?.trim();
  if (specific) return specific;
  const global = process.env.OPENAI_PROMPT_VERSION?.trim();
  return global || null;
}

/** Variables required by each prompt type (for validation / safe fallback). */
export const REQUIRED_VARIABLES: Record<PromptType, string[]> = {
  clientSummary: [
    "client_profile",
    "household_summary",
    "financial_summary",
    "contracts_summary",
    "timeline_events",
    "open_items",
    "service_status",
    "active_deals",
  ],
  clientOpportunities: [
    "client_profile",
    "household_summary",
    "financial_summary",
    "contracts_summary",
    "timeline_events",
    "open_items",
    "service_status",
    "active_deals",
  ],
  nextBestAction: [
    "client_profile",
    "household_summary",
    "financial_summary",
    "contracts_summary",
    "timeline_events",
    "open_items",
    "service_status",
    "active_deals",
  ],
  preMeetingBriefing: [
    "client_profile",
    "household_summary",
    "financial_summary",
    "contracts_summary",
    "timeline_events",
    "open_items",
    "service_status",
    "active_deals",
    "meeting_context",
  ],
  postMeetingFollowup: [
    "client_profile",
    "household_summary",
    "financial_summary",
    "contracts_summary",
    "timeline_events",
    "open_items",
    "service_status",
    "active_deals",
    "meeting_notes",
  ],
  teamSummary: [
    "team_overview",
    "team_kpis",
    "team_members",
    "team_alerts",
    "newcomer_adaptation",
    "period_label",
  ],
};

export type PromptConfig = {
  id: string;
  version?: string;
  requiredVariables: string[];
};

/**
 * Returns prompt id, optional version, and required variables for the given type.
 * Returns null if prompt id is not set (service should fail safely).
 */
export function getPromptConfig(type: PromptType): PromptConfig | null {
  const id = getPromptId(type);
  if (!id) return null;
  const version = getPromptVersion(type);
  return {
    id,
    ...(version ? { version } : {}),
    requiredVariables: REQUIRED_VARIABLES[type] ?? [],
  };
}
