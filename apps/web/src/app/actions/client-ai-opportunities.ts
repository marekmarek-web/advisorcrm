"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getFinancialSummary } from "@/app/actions/financial";
import { getCoverageForContact } from "@/app/actions/coverage";
import { getOpenOpportunitiesByContactWithMeta } from "@/app/actions/pipeline";
import { getTasksByContactId } from "@/app/actions/tasks";
import { listEvents } from "@/app/actions/events";
import { getHouseholdForContact } from "@/app/actions/households";
import { getReferralRequestSignals } from "@/app/actions/referral";
import type { OpportunitySignals } from "@/lib/ai-opportunities/types";
import { computeOpportunities } from "@/lib/ai-opportunities/compute-opportunities";
import type { ClientAiOpportunitiesResult } from "@/lib/ai-opportunities/types";

const STALE_ANALYSIS_MONTHS = 12;
const NO_CONTACT_MONTHS = 6;
const STALE_OPPORTUNITY_DAYS = 30;
const ANNIVERSARY_WINDOW_DAYS = 60;

/** Load all inputs for contact and build OpportunitySignals. */
export async function aggregateSignalsForContact(
  contactId: string
): Promise<OpportunitySignals> {
  const now = new Date();
  const nowStr = now.toISOString();

  const [
    financialSummaryView,
    financialSummary,
    coverageResult,
    openOpportunitiesMeta,
    tasks,
    eventsPast,
    eventsFuture,
    household,
    referralRequestSignals,
  ] = await Promise.all([
    getClientFinancialSummaryForContact(contactId),
    getFinancialSummary(contactId),
    getCoverageForContact(contactId),
    getOpenOpportunitiesByContactWithMeta(contactId),
    getTasksByContactId(contactId),
    listEvents({ contactId, end: nowStr }),
    listEvents({ contactId, start: nowStr }),
    getHouseholdForContact(contactId),
    getReferralRequestSignals(contactId),
  ]);

  const lastMeetingAt =
    eventsPast.length > 0
      ? new Date(
          Math.max(...eventsPast.map((e) => new Date(e.startAt).getTime()))
        )
      : null;
  const nextMeetingAt =
    eventsFuture.length > 0
      ? new Date(
          Math.min(...eventsFuture.map((e) => new Date(e.startAt).getTime()))
        )
      : null;

  const hasAnyData =
    financialSummaryView.status !== "missing" ||
    financialSummary.contractTimeline.length > 0 ||
    coverageResult.resolvedItems.some((i) => i.status !== "none" || i.source !== "default") ||
    openOpportunitiesMeta.length > 0 ||
    tasks.length > 0 ||
    eventsPast.length > 0 ||
    eventsFuture.length > 0;

  return {
    contactId,
    householdId: household?.id ?? null,
    householdName: household?.name ?? null,
    referralRequestSignals: referralRequestSignals ?? null,
    financialSummary: {
      status: financialSummaryView.status,
      primaryAnalysisId: financialSummaryView.primaryAnalysisId,
      updatedAt: financialSummaryView.updatedAt,
      scope: financialSummaryView.scope,
      gaps: financialSummaryView.gaps ?? [],
    },
    contractTimeline: financialSummary.contractTimeline ?? [],
    coverageItems: coverageResult.resolvedItems.map((i) => ({
      itemKey: i.itemKey,
      segmentCode: i.segmentCode,
      category: i.category,
      label: i.label,
      status: i.status,
      linkedContractId: i.linkedContractId,
      linkedOpportunityId: i.linkedOpportunityId,
      isRelevant: i.isRelevant,
    })),
    openOpportunities: openOpportunitiesMeta,
    openTasksCount: tasks.filter((t) => !t.completedAt).length,
    lastMeetingAt,
    nextMeetingAt,
    hasAnyData,
    pendingFaPlanItems: await (async () => {
      try {
        const { getFaPlanItems } = await import("./fa-plan-items");
        if (!financialSummaryView.primaryAnalysisId) return [];
        const items = await getFaPlanItems(financialSummaryView.primaryAnalysisId);
        return items
          .filter((i) => i.status !== "sold" && i.status !== "not_relevant" && i.status !== "cancelled")
          .map((i) => ({ label: i.label ?? "—", status: i.status, segmentCode: i.segmentCode, provider: i.provider }));
      } catch (err) {
        // Pozn.: pendingFaPlanItems je sekundární pole pro AI signal surface — pokud načtení
        // selže, necháme zbytek agregátu projít a jen zalogujeme, aby byla chyba viditelná
        // v observability a my si mohli ověřit incidenty (dříve se tichá [] maskovala).
        console.error("[aggregateSignalsForContact] getFaPlanItems failed", err);
        return [];
      }
    })(),
  };
}

export async function getClientAiOpportunities(
  contactId: string
): Promise<ClientAiOpportunitiesResult> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }
  if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  try {
    const signals = await aggregateSignalsForContact(contactId);
    const opportunities = computeOpportunities(signals, {
      staleAnalysisMonths: STALE_ANALYSIS_MONTHS,
      noContactMonths: NO_CONTACT_MONTHS,
      staleOpportunityDays: STALE_OPPORTUNITY_DAYS,
      anniversaryWindowDays: ANNIVERSARY_WINDOW_DAYS,
    });
    const nextBestAction = opportunities.length > 0 ? opportunities[0] : null;

    return {
      opportunities,
      nextBestAction,
      hasAnyData: signals.hasAnyData,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getClientAiOpportunities]", contactId, err);
    }
    return {
      opportunities: [],
      nextBestAction: null,
      hasAnyData: false,
    };
  }
}
