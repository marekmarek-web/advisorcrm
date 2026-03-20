"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getContact } from "@/app/actions/contacts";
import {
  createAiFeedback,
  type AiFeedbackActionTaken,
  type AiFeedbackVerdict,
  type CreateAiFeedbackResult,
} from "@/app/actions/ai-feedback";
import { getMembership } from "@/lib/auth/get-membership";
import { getGenerationById } from "@/lib/ai/ai-generations-repository";
import { checkForDuplicates, checkTeamActionDuplicates, type DuplicateCheckResult } from "@/lib/ai/actions/duplicate-check";
import { executeAiAction, executeTeamAiAction } from "@/lib/ai/actions/action-executors";
import type {
  AiActionExecutionResult,
  AiActionSuggestion,
  AiActionType,
} from "@/lib/ai/actions/action-suggestions";
import { aiFeedback, aiGenerations, and, db, eq, sql } from "db";

async function ensureContactAccess(contactId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (!auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const contact = await getContact(contactId);
  if (!contact) throw new Error("Kontakt nenalezen");
}

export async function createCrmActionFromAi(
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
    if (!canWrite) return { ok: false, error: "Forbidden" };

    await ensureContactAccess(contactId);
    const generation = await getGenerationById(suggestion.sourceGenerationId, auth.tenantId);
    if (!generation) {
      return { ok: false, error: "AI generování nenalezeno nebo k němu nemáte přístup." };
    }

    return executeAiAction(suggestion, contactId, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "Nepodařilo se vytvořit akci." };
  }
}

export async function checkAiActionDuplicates(
  contactId: string,
  actionType: AiActionType,
  title: string
): Promise<DuplicateCheckResult> {
  try {
    await ensureContactAccess(contactId);
    return await checkForDuplicates(contactId, actionType, title);
  } catch {
    return { risk: "none", existingItems: [] };
  }
}

/** Create manager/member follow-up from team summary. Validates teamId and optional memberId; generation must be teamSummary. */
export async function createTeamActionFromAi(
  suggestion: AiActionSuggestion,
  teamId: string,
  memberId?: string | null,
  options?: { allowLikelyDuplicates?: boolean; idempotencyKey?: string; sourceSurface?: string }
): Promise<AiActionExecutionResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "team_overview:read")) return { ok: false, error: "Forbidden" };
    if (teamId !== auth.tenantId) return { ok: false, error: "Forbidden" };

    if (memberId) {
      const member = await getMembership(memberId);
      if (!member || member.tenantId !== auth.tenantId) return { ok: false, error: "Forbidden" };
    }

    const generation = await getGenerationById(suggestion.sourceGenerationId, auth.tenantId);
    if (!generation) return { ok: false, error: "AI generování nenalezeno nebo k němu nemáte přístup." };
    if (generation.entityType !== "team" || generation.promptType !== "teamSummary") {
      return { ok: false, error: "Akce musí vycházet z týmového AI shrnutí." };
    }

    return await executeTeamAiAction(suggestion, teamId, memberId ?? undefined, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "Nepodařilo se vytvořit akci." };
  }
}

/** Check duplicates for team follow-up (tenant + optional assignee). */
export async function checkTeamActionDuplicatesAction(
  teamId: string,
  memberId: string | null,
  actionType: AiActionType,
  title: string
): Promise<DuplicateCheckResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "team_overview:read")) return { risk: "none", existingItems: [] };
    if (teamId !== auth.tenantId) return { risk: "none", existingItems: [] };
    return await checkTeamActionDuplicates(auth.tenantId, memberId, actionType, title);
  } catch {
    return { risk: "none", existingItems: [] };
  }
}

export async function submitAiFeedbackWithAction(
  generationId: string,
  verdict: AiFeedbackVerdict,
  action?: {
    actionTaken: AiFeedbackActionTaken;
    createdEntityType?: string;
    createdEntityId?: string;
    note?: string;
  }
): Promise<CreateAiFeedbackResult> {
  const options = action
    ? {
        actionTaken: action.actionTaken,
        createdEntityType: action.createdEntityType ?? null,
        createdEntityId: action.createdEntityId ?? null,
        note: action.note ?? null,
      }
    : undefined;
  return createAiFeedback(generationId, verdict, options);
}

export async function getAiActionUsageStats(): Promise<{
  totalGenerations: number;
  totalActionsCreated: number;
  actionsByType: Record<string, number>;
  feedbackCounts: { accepted: number; rejected: number; edited: number };
}> {
  const auth = await requireAuthInAction();
  const canRead =
    hasPermission(auth.roleName, "contacts:read") || hasPermission(auth.roleName, "opportunities:read");
  if (!canRead) {
    return {
      totalGenerations: 0,
      totalActionsCreated: 0,
      actionsByType: {},
      feedbackCounts: { accepted: 0, rejected: 0, edited: 0 },
    };
  }

  const totalGenerationsRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiGenerations)
    .where(eq(aiGenerations.tenantId, auth.tenantId));
  const totalGenerations = Number(totalGenerationsRows[0]?.count ?? 0);

  const actionRows = await db
    .select({
      actionTaken: aiFeedback.actionTaken,
      count: sql<number>`count(*)::int`,
    })
    .from(aiFeedback)
    .innerJoin(aiGenerations, eq(aiFeedback.generationId, aiGenerations.id))
    .where(
      and(
        eq(aiGenerations.tenantId, auth.tenantId),
        sql`${aiFeedback.actionTaken} is not null`,
        sql`${aiFeedback.actionTaken} <> 'none'`
      )
    )
    .groupBy(aiFeedback.actionTaken);

  const verdictRows = await db
    .select({
      verdict: aiFeedback.verdict,
      count: sql<number>`count(*)::int`,
    })
    .from(aiFeedback)
    .innerJoin(aiGenerations, eq(aiFeedback.generationId, aiGenerations.id))
    .where(eq(aiGenerations.tenantId, auth.tenantId))
    .groupBy(aiFeedback.verdict);

  const actionsByType: Record<string, number> = {};
  let totalActionsCreated = 0;
  for (const row of actionRows) {
    const key = row.actionTaken ?? "unknown";
    const value = Number(row.count ?? 0);
    actionsByType[key] = value;
    totalActionsCreated += value;
  }

  const feedbackCounts = { accepted: 0, rejected: 0, edited: 0 };
  for (const row of verdictRows) {
    const value = Number(row.count ?? 0);
    if (row.verdict === "accepted") feedbackCounts.accepted = value;
    if (row.verdict === "rejected") feedbackCounts.rejected = value;
    if (row.verdict === "edited") feedbackCounts.edited = value;
  }

  return {
    totalGenerations,
    totalActionsCreated,
    actionsByType,
    feedbackCounts,
  };
}

export type TeamAiUsageStats = {
  teamSummariesGenerated: number;
  summariesWithActionsCreated: number;
  verdictCounts: { accepted: number; rejected: number; edited: number };
  actionsByType: Record<string, number>;
};

/** Team AI usage: team summaries generated, with-actions count, verdict split, action type distribution. */
export async function getTeamAiUsageStats(): Promise<TeamAiUsageStats> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) {
    return {
      teamSummariesGenerated: 0,
      summariesWithActionsCreated: 0,
      verdictCounts: { accepted: 0, rejected: 0, edited: 0 },
      actionsByType: {},
    };
  }

  const teamGenCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.tenantId, auth.tenantId),
        eq(aiGenerations.entityType, "team"),
        eq(aiGenerations.promptType, "teamSummary")
      )
    );
  const teamSummariesGenerated = Number(teamGenCount[0]?.count ?? 0);

  const withActions = await db
    .select({ count: sql<number>`count(distinct ${aiFeedback.generationId})::int` })
    .from(aiFeedback)
    .innerJoin(aiGenerations, eq(aiFeedback.generationId, aiGenerations.id))
    .where(
      and(
        eq(aiGenerations.tenantId, auth.tenantId),
        eq(aiGenerations.entityType, "team"),
        eq(aiGenerations.promptType, "teamSummary"),
        sql`${aiFeedback.actionTaken} is not null`,
        sql`${aiFeedback.actionTaken} <> 'none'`
      )
    );
  const summariesWithActionsCreated = Number(withActions[0]?.count ?? 0);

  const verdictRows = await db
    .select({ verdict: aiFeedback.verdict, count: sql<number>`count(*)::int` })
    .from(aiFeedback)
    .innerJoin(aiGenerations, eq(aiFeedback.generationId, aiGenerations.id))
    .where(
      and(
        eq(aiGenerations.tenantId, auth.tenantId),
        eq(aiGenerations.entityType, "team"),
        eq(aiGenerations.promptType, "teamSummary")
      )
    )
    .groupBy(aiFeedback.verdict);

  const actionRows = await db
    .select({ actionTaken: aiFeedback.actionTaken, count: sql<number>`count(*)::int` })
    .from(aiFeedback)
    .innerJoin(aiGenerations, eq(aiFeedback.generationId, aiGenerations.id))
    .where(
      and(
        eq(aiGenerations.tenantId, auth.tenantId),
        eq(aiGenerations.entityType, "team"),
        eq(aiGenerations.promptType, "teamSummary"),
        sql`${aiFeedback.actionTaken} is not null`
      )
    )
    .groupBy(aiFeedback.actionTaken);

  const verdictCounts = { accepted: 0, rejected: 0, edited: 0 };
  for (const row of verdictRows) {
    const v = Number(row.count ?? 0);
    if (row.verdict === "accepted") verdictCounts.accepted = v;
    if (row.verdict === "rejected") verdictCounts.rejected = v;
    if (row.verdict === "edited") verdictCounts.edited = v;
  }

  const actionsByType: Record<string, number> = {};
  for (const row of actionRows) {
    const key = row.actionTaken ?? "unknown";
    actionsByType[key] = Number(row.count ?? 0);
  }

  return {
    teamSummariesGenerated,
    summariesWithActionsCreated,
    verdictCounts,
    actionsByType,
  };
}
