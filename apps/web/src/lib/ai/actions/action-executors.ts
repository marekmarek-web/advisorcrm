"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getContact } from "@/app/actions/contacts";
import { createTask } from "@/app/actions/tasks";
import { createEvent } from "@/app/actions/events";
import { createOpportunity, getOpportunityStages } from "@/app/actions/pipeline";
import { createAiFeedback } from "@/app/actions/ai-feedback";
import { logActivity } from "@/app/actions/activity";
import { getVisibleUserIds, resolveScopeForRole } from "@/lib/team-hierarchy";
import type { RoleName } from "@/shared/rolePermissions";
import { validateActionSuggestion } from "./action-guardrails";
import { checkForDuplicates, checkTeamActionDuplicates } from "./duplicate-check";
import type { AiActionExecutionResult, AiActionSuggestion } from "./action-suggestions";
import { logAiAutomationEvent } from "@/lib/ai/automation-telemetry";

const idempotencyCache = new Map<string, number>();
const IDEMPOTENCY_WINDOW_MS = 45_000;

function markIdempotency(key: string) {
  idempotencyCache.set(key, Date.now() + IDEMPOTENCY_WINDOW_MS);
}

function hasRecentIdempotency(key: string) {
  const exp = idempotencyCache.get(key);
  if (!exp) return false;
  if (exp <= Date.now()) {
    idempotencyCache.delete(key);
    return false;
  }
  return true;
}

function feedbackActionTaken(actionType: AiActionSuggestion["actionType"]) {
  if (actionType === "task") return "task_created" as const;
  if (actionType === "meeting") return "meeting_created" as const;
  if (actionType === "deal") return "deal_created" as const;
  return "service_action_created" as const;
}

function buildDuplicateWarning(count: number): string | undefined {
  if (count === 0) return undefined;
  if (count === 1) return "Nalezena 1 podobná otevřená položka.";
  return `Nalezeno ${count} podobných otevřených položek.`;
}

function toExecutionConflictItems(items: Array<{ type: string; id: string; title: string }>) {
  return items.filter(
    (item): item is { type: "task" | "event" | "opportunity"; id: string; title: string } =>
      item.type === "task" || item.type === "event" || item.type === "opportunity"
  );
}

export async function executeAiAction(
  suggestion: AiActionSuggestion,
  contactId: string,
  options?: { allowLikelyDuplicates?: boolean; idempotencyKey?: string; sourceSurface?: string }
): Promise<AiActionExecutionResult> {
  try {
    const auth = await requireAuthInAction();
    const canWrite =
      hasPermission(auth.roleName, "contacts:write") ||
      hasPermission(auth.roleName, "tasks:*") ||
      hasPermission(auth.roleName, "opportunities:write");
    if (!canWrite) return { ok: false, error: "Forbidden", code: "FORBIDDEN" };

    if (auth.roleName === "Client") {
      if (!auth.contactId || auth.contactId !== contactId) {
        return { ok: false, error: "Forbidden", code: "FORBIDDEN" };
      }
    }

    const contact = await getContact(contactId);
    if (!contact) return { ok: false, error: "Kontakt nenalezen." };

    const validation = validateActionSuggestion(suggestion);
    if (!validation.valid) {
      return { ok: false, error: "AI návrh akce není validní.", warnings: validation.warnings };
    }

    const safeSuggestion = validation.sanitized;
    const idempotencyKey =
      options?.idempotencyKey ??
      `${auth.tenantId}:${contactId}:${safeSuggestion.actionType}:${safeSuggestion.title.toLowerCase()}`;
    if (hasRecentIdempotency(idempotencyKey)) {
      return {
        ok: false,
        error: "Stejná AI akce už byla před chvílí odeslána.",
        code: "IDEMPOTENCY_CONFLICT",
      };
    }

    const duplicate = await checkForDuplicates(contactId, safeSuggestion.actionType, safeSuggestion.title);
    const duplicateWarning = buildDuplicateWarning(duplicate.existingItems.length);
    if (duplicate.risk === "likely" && !options?.allowLikelyDuplicates) {
      await logAiAutomationEvent({
        tenantId: auth.tenantId,
        userId: auth.userId,
        event: "conflict",
        surface: options?.sourceSurface ?? "portal_contact",
        generationId: safeSuggestion.sourceGenerationId,
        meta: { reason: "duplicate_likely", count: duplicate.existingItems.length },
      });
      return {
        ok: false,
        error: "Byla nalezena pravděpodobná duplicita. Potvrďte vytvoření znovu.",
        code: "DUPLICATE_CONFLICT",
        conflict: {
          duplicateRisk: duplicate.risk,
          existingItems: toExecutionConflictItems(duplicate.existingItems),
        },
      };
    }

    let entityId: string | null = null;
    let entityType: "task" | "event" | "opportunity" | null = null;

    if (safeSuggestion.actionType === "task" || safeSuggestion.actionType === "service_action") {
      entityId = await createTask({
        title: safeSuggestion.title,
        description: safeSuggestion.description,
        contactId,
        dueDate: safeSuggestion.dueAt ? safeSuggestion.dueAt.slice(0, 10) : undefined,
      });
      entityType = "task";
    } else if (safeSuggestion.actionType === "meeting") {
      const startAt = safeSuggestion.dueAt ?? new Date().toISOString();
      const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
      entityId = await createEvent({
        title: safeSuggestion.title,
        eventType: "schuzka",
        startAt,
        endAt,
        contactId,
        notes: safeSuggestion.description,
      });
      entityType = "event";
    } else {
      const stages = await getOpportunityStages();
      const firstStage = [...stages].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (!firstStage) {
        return { ok: false, error: "Nelze vytvořit obchod bez definovaných fází pipeline." };
      }
      entityId = await createOpportunity({
        title: safeSuggestion.title,
        caseType: safeSuggestion.caseType || "jiné",
        contactId,
        stageId: firstStage.id,
        expectedCloseDate: safeSuggestion.dueAt ? safeSuggestion.dueAt.slice(0, 10) : undefined,
      });
      entityType = "opportunity";
    }

    if (!entityId || !entityType) {
      return { ok: false, error: "Nepodařilo se vytvořit CRM akci." };
    }

    markIdempotency(idempotencyKey);
    await createAiFeedback(safeSuggestion.sourceGenerationId, "accepted", {
      actionTaken: feedbackActionTaken(safeSuggestion.actionType),
      createdEntityType: entityType,
      createdEntityId: entityId,
      note:
        safeSuggestion.actionType === "service_action"
          ? "Akce vytvořena jako servisní úkol."
          : null,
    });

    const aiMeta = {
      source: "ai",
      aiGenerationId: safeSuggestion.sourceGenerationId,
      aiPromptType: safeSuggestion.sourcePromptType,
      aiSuggested: true,
      title: safeSuggestion.title,
      contactId,
      actionType: safeSuggestion.actionType,
      duplicateRisk: duplicate.risk,
      duplicateItems: duplicate.existingItems.map((item) => ({
        type: item.type,
        id: item.id,
      })),
    };

    await Promise.allSettled([
      logActivity(entityType, entityId, "ai_created", aiMeta),
      logActivity("contact", contactId, "ai_action_created", {
        ...aiMeta,
        createdEntityType: entityType,
        createdEntityId: entityId,
      }),
      logAiAutomationEvent({
        tenantId: auth.tenantId,
        userId: auth.userId,
        event: "execute",
        surface: options?.sourceSurface ?? "portal_contact",
        generationId: safeSuggestion.sourceGenerationId,
        entityType,
        entityId,
        meta: {
          actionType: safeSuggestion.actionType,
          duplicateRisk: duplicate.risk,
        },
      }),
    ]);

    return {
      ok: true,
      entityId,
      entityType,
      duplicateWarning,
      warnings: validation.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "AI akci se nepodařilo vytvořit." };
  }
}

/** Execute team/manager follow-up from team summary. No contact; optional memberId assignee. Only task, meeting, service_action. */
export async function executeTeamAiAction(
  suggestion: AiActionSuggestion,
  teamId: string,
  memberId?: string | null,
  options?: { allowLikelyDuplicates?: boolean; idempotencyKey?: string; sourceSurface?: string }
): Promise<AiActionExecutionResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "team_overview:read")) {
      return { ok: false, error: "Forbidden", code: "FORBIDDEN" };
    }
    if (teamId !== auth.tenantId) return { ok: false, error: "Forbidden", code: "FORBIDDEN" };

    const validation = validateActionSuggestion(suggestion);
    if (!validation.valid) {
      return { ok: false, error: "AI návrh akce není validní.", warnings: validation.warnings };
    }

    const safeSuggestion = validation.sanitized;
    const actionType = safeSuggestion.actionType;
    if (actionType === "deal") {
      return { ok: false, error: "Z týmového shrnutí nelze vytvořit obchod. Zvolte úkol nebo schůzku." };
    }

    const assignee = memberId ?? auth.userId;
    const maxScope = resolveScopeForRole(auth.roleName as RoleName, "full");
    const visibleIds = await getVisibleUserIds(auth.tenantId, auth.userId, auth.roleName as RoleName, maxScope);
    if (!visibleIds.includes(assignee)) {
      return { ok: false, error: "Forbidden", code: "FORBIDDEN" };
    }
    const idempotencyKey =
      options?.idempotencyKey ??
      `${auth.tenantId}:${assignee}:${actionType}:${safeSuggestion.title.toLowerCase()}`;
    if (hasRecentIdempotency(idempotencyKey)) {
      return {
        ok: false,
        error: "Stejná AI akce už byla před chvílí odeslána.",
        code: "IDEMPOTENCY_CONFLICT",
      };
    }

    const duplicate = await checkTeamActionDuplicates(
      auth.tenantId,
      assignee,
      actionType,
      safeSuggestion.title
    );
    const duplicateWarning = buildDuplicateWarning(duplicate.existingItems.length);
    if (duplicate.risk === "likely" && !options?.allowLikelyDuplicates) {
      await logAiAutomationEvent({
        tenantId: auth.tenantId,
        userId: auth.userId,
        event: "conflict",
        surface: options?.sourceSurface ?? "portal_team",
        generationId: safeSuggestion.sourceGenerationId,
        meta: { reason: "duplicate_likely", count: duplicate.existingItems.length },
      });
      return {
        ok: false,
        error: "Byla nalezena pravděpodobná duplicita. Potvrďte vytvoření znovu.",
        code: "DUPLICATE_CONFLICT",
        conflict: {
          duplicateRisk: duplicate.risk,
          existingItems: toExecutionConflictItems(duplicate.existingItems),
        },
      };
    }

    let entityId: string | null = null;
    let entityType: "task" | "event" | "opportunity" | null = null;

    if (actionType === "task" || actionType === "service_action") {
      entityId = await createTask({
        title: safeSuggestion.title,
        description: safeSuggestion.description,
        dueDate: safeSuggestion.dueAt ? safeSuggestion.dueAt.slice(0, 10) : undefined,
        assignedTo: memberId ?? undefined,
      });
      entityType = "task";
    } else {
      const startAt = safeSuggestion.dueAt ?? new Date().toISOString();
      const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
      entityId = await createEvent({
        title: safeSuggestion.title,
        eventType: "schuzka",
        startAt,
        endAt,
        notes: safeSuggestion.description,
        assignedTo: memberId ?? undefined,
      });
      entityType = "event";
    }

    if (!entityId || !entityType) {
      return { ok: false, error: "Nepodařilo se vytvořit akci." };
    }

    markIdempotency(idempotencyKey);
    await createAiFeedback(safeSuggestion.sourceGenerationId, "accepted", {
      actionTaken: feedbackActionTaken(safeSuggestion.actionType),
      createdEntityType: entityType,
      createdEntityId: entityId,
      note: actionType === "service_action" ? "Týmová servisní akce." : null,
    });

    const aiMeta = {
      source: "ai",
      aiGenerationId: safeSuggestion.sourceGenerationId,
      aiPromptType: safeSuggestion.sourcePromptType,
      aiSuggested: true,
      teamId,
      memberId: memberId ?? undefined,
      title: safeSuggestion.title,
      actionType,
      duplicateRisk: duplicate.risk,
      duplicateItems: duplicate.existingItems.map((item) => ({ type: item.type, id: item.id })),
    };

    await Promise.allSettled([
      logActivity(entityType, entityId, "ai_created", aiMeta),
      logAiAutomationEvent({
        tenantId: auth.tenantId,
        userId: auth.userId,
        event: "execute",
        surface: options?.sourceSurface ?? "portal_team",
        generationId: safeSuggestion.sourceGenerationId,
        entityType,
        entityId,
        meta: { actionType },
      }),
    ]);

    return {
      ok: true,
      entityId,
      entityType,
      duplicateWarning,
      warnings: validation.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "AI akci se nepodařilo vytvořit." };
  }
}
