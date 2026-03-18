/**
 * Central AI service layer – server-only. Called from server actions (e.g. ai-generations.ts).
 * Do not call from client components.
 */
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getPromptId, getPromptVersion, type PromptType } from "@/lib/ai/prompt-registry";
import { createResponseFromPrompt } from "@/lib/openai";
import { saveGeneration } from "@/lib/ai/ai-generations-repository";
import { applyOutputGuardrails } from "@/lib/ai/guardrails";
import {
  buildClientAiContextRaw,
  type ClientAiContextRaw,
  renderClientAiPromptVariables,
  buildPreMeetingContextRaw,
  renderPreMeetingPromptVariables,
  buildPostMeetingContextRaw,
  renderPostMeetingPromptVariables,
  buildTeamAiContextRaw,
  renderTeamAiPromptVariables,
} from "@/lib/ai/context";
import { computeCompleteness, type ContextCompleteness } from "@/lib/ai/context/completeness";

const SAFE_ERROR = "Generování se nepovedlo. Zkuste to později.";
const NOT_CONFIGURED = "Tato funkce není nakonfigurována (chybí prompt ID v nastavení).";

export type GenerationSuccess = { ok: true; text: string; generationId: string };
export type GenerationFailure = { ok: false; error: string; generationId?: string };
export type GenerationResult = GenerationSuccess | GenerationFailure;

function ensureClientAccess(clientId: string): Promise<{ tenantId: string; userId: string }> {
  return (async () => {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (!auth.contactId || auth.contactId !== clientId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }
    return { tenantId: auth.tenantId, userId: auth.userId };
  })();
}

function auditLog(params: {
  userId: string;
  entityType: string;
  entityId: string;
  promptType: string;
  success: boolean;
  error?: string;
}): void {
  console.info("[AI]", {
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    promptType: params.promptType,
    success: params.success,
    ...(params.error ? { error: params.error } : {}),
    ts: new Date().toISOString(),
  });
}

function toContextMeta(
  completeness: ContextCompleteness | null
): Pick<ContextCompleteness, "overall" | "missingAreas" | "outdatedAreas" | "flags"> | null {
  if (!completeness) return null;
  return {
    overall: completeness.overall,
    missingAreas: completeness.missingAreas,
    outdatedAreas: completeness.outdatedAreas,
    flags: completeness.flags,
  };
}

function getClientCompleteness(raw: ClientAiContextRaw): ContextCompleteness {
  return computeCompleteness(raw);
}

async function runPromptGeneration(params: {
  tenantId: string;
  userId: string;
  generatedByUserId: string;
  promptType: PromptType;
  entityType: string;
  entityId: string;
  variables: Record<string, string>;
  completeness?: ContextCompleteness | null;
  activeDealTitles?: string[];
}): Promise<GenerationResult> {
  const promptId = getPromptId(params.promptType);
  if (!promptId) return { ok: false, error: NOT_CONFIGURED };
  const version = getPromptVersion(params.promptType);
  const contextMeta = toContextMeta(params.completeness ?? null);

  const result = await createResponseFromPrompt(
    { promptId, version, variables: params.variables },
    { store: false }
  );

  if (!result.ok) {
    auditLog({
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      promptType: params.promptType,
      success: false,
      error: result.error,
    });

    const failureId = await saveGeneration({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      promptType: params.promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: params.generatedByUserId,
      outputText: "",
      status: "failure",
      contextMeta,
    }).catch(() => "");

    return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
  }

  const guardedText = applyOutputGuardrails({
    promptType: params.promptType,
    outputText: result.text,
    variables: params.variables,
    completeness: params.completeness ?? null,
    activeDealTitles: params.activeDealTitles ?? [],
  });

  const generationId = await saveGeneration({
    tenantId: params.tenantId,
    entityType: params.entityType,
    entityId: params.entityId,
    promptType: params.promptType,
    promptId,
    promptVersion: version ?? undefined,
    generatedByUserId: params.generatedByUserId,
    outputText: guardedText,
    status: "success",
    contextMeta,
  });

  auditLog({
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    promptType: params.promptType,
    success: true,
  });

  return { ok: true, text: guardedText, generationId };
}

export async function generateClientSummary(
  clientId: string,
  userId: string
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    const promptType: PromptType = "clientSummary";

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const completeness = getClientCompleteness(raw);
    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType: "contact",
      entityId: clientId,
      variables,
      completeness,
      activeDealTitles: raw.activeDeals.map((d) => d.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message.includes("Kontakt nenalezen")) {
      return { ok: false, error: message };
    }
    console.error("[AI] generateClientSummary", clientId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

export async function generateClientOpportunities(
  clientId: string,
  userId: string
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    const promptType: PromptType = "clientOpportunities";

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const completeness = getClientCompleteness(raw);
    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType: "contact",
      entityId: clientId,
      variables,
      completeness,
      activeDealTitles: raw.activeDeals.map((d) => d.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message.includes("Kontakt nenalezen")) {
      return { ok: false, error: message };
    }
    console.error("[AI] generateClientOpportunities", clientId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

export async function generateNextBestAction(
  clientId: string,
  userId: string
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    const promptType: PromptType = "nextBestAction";

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const completeness = getClientCompleteness(raw);
    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType: "contact",
      entityId: clientId,
      variables,
      completeness,
      activeDealTitles: raw.activeDeals.map((d) => d.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message.includes("Kontakt nenalezen")) {
      return { ok: false, error: message };
    }
    console.error("[AI] generateNextBestAction", clientId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

export async function generatePreMeetingBriefing(
  clientId: string,
  userId: string,
  eventId?: string | null
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    if (eventId) {
      const { getEvent } = await import("@/app/actions/events");
      const ev = await getEvent(eventId);
      if (ev && ev.contactId !== clientId) return { ok: false, error: "Forbidden" };
    }

    const promptType: PromptType = "preMeetingBriefing";

    const raw = await buildPreMeetingContextRaw(clientId, userId, eventId);
    const variables = await renderPreMeetingPromptVariables(raw);

    const entityType = eventId ? "event" : "contact";
    const entityId = eventId ?? clientId;
    const completeness = getClientCompleteness(raw.clientContext);
    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType,
      entityId,
      variables,
      completeness,
      activeDealTitles: raw.clientContext.activeDeals.map((d) => d.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") return { ok: false, error: message };
    console.error("[AI] generatePreMeetingBriefing", clientId, eventId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

export async function generatePostMeetingFollowup(
  clientId: string,
  userId: string,
  meetingNotes: string,
  meetingId?: string | null
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    const promptType: PromptType = "postMeetingFollowup";

    const raw = await buildPostMeetingContextRaw(clientId, userId, meetingNotes, meetingId);
    const variables = await renderPostMeetingPromptVariables(raw);

    const entityType = meetingId ? "meeting_note" : "contact";
    const entityId = meetingId ?? clientId;
    const completeness = getClientCompleteness(raw.clientContext);
    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType,
      entityId,
      variables,
      completeness,
      activeDealTitles: raw.clientContext.activeDeals.map((d) => d.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") return { ok: false, error: message };
    console.error("[AI] generatePostMeetingFollowup", clientId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

/**
 * Team summary: manager/team leader/admin only. Uses central runPromptGeneration.
 * teamId must equal tenantId (single team per tenant).
 */
export async function generateTeamSummary(
  teamId: string,
  userId: string,
  period: string
): Promise<GenerationResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "team_overview:read")) return { ok: false, error: "Forbidden" };
    if (teamId !== auth.tenantId) return { ok: false, error: "Forbidden" };

    const promptType: PromptType = "teamSummary";
    const raw = await buildTeamAiContextRaw(teamId, userId, period);
    const variables = await renderTeamAiPromptVariables(raw);

    return await runPromptGeneration({
      tenantId: auth.tenantId,
      userId: auth.userId,
      generatedByUserId: userId,
      promptType,
      entityType: "team",
      entityId: teamId,
      variables,
      completeness: null,
      activeDealTitles: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") return { ok: false, error: message };
    console.error("[AI] generateTeamSummary", teamId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}
