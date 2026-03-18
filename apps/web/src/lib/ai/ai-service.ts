/**
 * Central AI service layer – server-only. Called from server actions (e.g. ai-generations.ts).
 * Do not call from client components.
 */
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getPromptId, getPromptVersion, type PromptType } from "@/lib/ai/prompt-registry";
import { createResponseFromPrompt } from "@/lib/openai";
import { saveGeneration } from "@/lib/ai/ai-generations-repository";
import {
  buildClientAiContextRaw,
  renderClientAiPromptVariables,
  buildPreMeetingContextRaw,
  renderPreMeetingPromptVariables,
  buildPostMeetingContextRaw,
  renderPostMeetingPromptVariables,
  buildTeamAiContextRaw,
  renderTeamAiPromptVariables,
} from "@/lib/ai/context";

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

export async function generateClientSummary(
  clientId: string,
  userId: string
): Promise<GenerationResult> {
  try {
    const auth = await ensureClientAccess(clientId);
    const promptType: PromptType = "clientSummary";
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    if (!result.ok) {
      auditLog({
        userId: auth.userId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        success: false,
        error: result.error,
      });
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    auditLog({
      userId: auth.userId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      success: true,
    });
    return { ok: true, text: result.text, generationId };
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
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    if (!result.ok) {
      auditLog({
        userId: auth.userId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        success: false,
        error: result.error,
      });
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    auditLog({
      userId: auth.userId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      success: true,
    });
    return { ok: true, text: result.text, generationId };
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
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildClientAiContextRaw(clientId);
    const variables = await renderClientAiPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    if (!result.ok) {
      auditLog({
        userId: auth.userId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        success: false,
        error: result.error,
      });
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType: "contact",
        entityId: clientId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    auditLog({
      userId: auth.userId,
      entityType: "contact",
      entityId: clientId,
      promptType,
      success: true,
    });
    return { ok: true, text: result.text, generationId };
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
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildPreMeetingContextRaw(clientId, userId, eventId);
    const variables = await renderPreMeetingPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    const entityType = eventId ? "event" : "contact";
    const entityId = eventId ?? clientId;

    if (!result.ok) {
      auditLog({
        userId: auth.userId,
        entityType,
        entityId,
        promptType,
        success: false,
        error: result.error,
      });
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType,
        entityId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType,
      entityId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    auditLog({
      userId: auth.userId,
      entityType,
      entityId,
      promptType,
      success: true,
    });
    return { ok: true, text: result.text, generationId };
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
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildPostMeetingContextRaw(clientId, userId, meetingNotes, meetingId);
    const variables = await renderPostMeetingPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    const entityType = meetingId ? "meeting_note" : "contact";
    const entityId = meetingId ?? clientId;

    if (!result.ok) {
      auditLog({
        userId: auth.userId,
        entityType,
        entityId,
        promptType,
        success: false,
        error: result.error,
      });
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType,
        entityId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType,
      entityId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    auditLog({
      userId: auth.userId,
      entityType,
      entityId,
      promptType,
      success: true,
    });
    return { ok: true, text: result.text, generationId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") return { ok: false, error: message };
    console.error("[AI] generatePostMeetingFollowup", clientId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}

/**
 * Stub for future team summary. Not wired to UI in this phase.
 */
export async function generateTeamSummary(
  teamId: string,
  userId: string,
  period: string
): Promise<GenerationResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };
    const promptType: PromptType = "teamSummary";
    const promptId = getPromptId(promptType);
    if (!promptId) return { ok: false, error: NOT_CONFIGURED };

    const raw = await buildTeamAiContextRaw(teamId, userId, period);
    const variables = await renderTeamAiPromptVariables(raw);
    const version = getPromptVersion(promptType);

    const result = await createResponseFromPrompt(
      { promptId, version, variables },
      { store: false }
    );

    if (!result.ok) {
      const failureId = await saveGeneration({
        tenantId: auth.tenantId,
        entityType: "team",
        entityId: teamId,
        promptType,
        promptId,
        promptVersion: version ?? undefined,
        generatedByUserId: userId,
        outputText: "",
        status: "failure",
      }).catch(() => "");
      return { ok: false, error: SAFE_ERROR, ...(failureId ? { generationId: failureId } : {}) };
    }

    const generationId = await saveGeneration({
      tenantId: auth.tenantId,
      entityType: "team",
      entityId: teamId,
      promptType,
      promptId,
      promptVersion: version ?? undefined,
      generatedByUserId: userId,
      outputText: result.text,
      status: "success",
    });
    return { ok: true, text: result.text, generationId };
  } catch (err) {
    console.error("[AI] generateTeamSummary", teamId, err);
    return { ok: false, error: SAFE_ERROR };
  }
}
