"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";

/**
 * Raw context for team-level AI (e.g. team summary).
 * Prepared for future use; not fully wired to UI in this phase.
 */
export type TeamAiContextRaw = {
  teamId: string;
  period: string;
  userId: string;
  tenantId: string;
  eventsSummary: string;
  tasksSummary: string;
};

export async function buildTeamAiContextRaw(
  teamId: string,
  userId: string,
  period: string
): Promise<TeamAiContextRaw> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  // TODO: enforce team membership when team access model is clear
  return {
    teamId,
    period,
    userId,
    tenantId: auth.tenantId,
    eventsSummary: "Připraveno pro pozdější napojení.",
    tasksSummary: "Připraveno pro pozdější napojení.",
  };
}

export async function renderTeamAiPromptVariables(raw: TeamAiContextRaw): Promise<Record<string, string>> {
  return {
    team_id: raw.teamId,
    period: raw.period,
    events_summary: raw.eventsSummary,
    tasks_summary: raw.tasksSummary,
  };
}
