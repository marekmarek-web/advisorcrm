"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getHouseholdForContact } from "@/app/actions/households";
import {
  getFinancialAnalysesForContact,
  getFinancialAnalysesForHousehold,
  getFinancialAnalysis,
  type FinancialAnalysisListItem,
} from "@/app/actions/financial-analyses";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import {
  selectTotalIncome,
  selectTotalExpense,
  selectTotalAssets,
  selectTotalLiabilities,
  selectNetWorth,
  selectIsReserveMet,
  selectReserveGap,
} from "@/lib/analyses/financial/selectors";

/** Status for summary block; "missing" when no analysis. */
export type ClientSummaryAnalysisStatus =
  | "draft"
  | "completed"
  | "exported"
  | "archived"
  | "missing";

export type ClientFinancialSummaryView = {
  primaryAnalysisId: string | null;
  scope: "contact" | "household";
  householdName: string | null;
  status: ClientSummaryAnalysisStatus;
  updatedAt: Date | null;
  lastExportedAt: Date | null;
  /** Goal names for display (e.g. first 5). */
  goals: { name: string }[];
  goalsCount: number;
  income: number;
  expenses: number;
  surplus: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  reserveOk: boolean;
  reserveGap: number;
  /** First 2–3 goals as priority labels. */
  priorities: string[];
  /** Derived gaps (e.g. "Chybí rezerva"). */
  gaps: string[];
};

const COMPLETED_STATUSES = new Set(["completed", "exported"]);

function selectPrimaryAnalysis(
  merged: { item: FinancialAnalysisListItem; fromHousehold: boolean }[]
): { item: FinancialAnalysisListItem; fromHousehold: boolean } | null {
  if (merged.length === 0) return null;
  const sorted = [...merged].sort((a, b) => {
    const aDone = COMPLETED_STATUSES.has(a.item.status) ? 0 : 1;
    const bDone = COMPLETED_STATUSES.has(b.item.status) ? 0 : 1;
    if (aDone !== bDone) return aDone - bDone;
    return (
      new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime()
    );
  });
  return sorted[0] ?? null;
}

function deriveGaps(data: FinancialAnalysisData): string[] {
  const gaps: string[] = [];
  const income = selectTotalIncome(data);
  const expense = selectTotalExpense(data);
  const assets = selectTotalAssets(data);
  const liabilities = selectTotalLiabilities(data);
  const reserveOk = selectIsReserveMet(data);
  const goals = data.goals ?? [];

  if (!reserveOk) gaps.push("Chybí rezerva");
  if (goals.length === 0) gaps.push("Žádné cíle");
  if (
    assets > 0 &&
    liabilities > 0 &&
    liabilities / assets > 0.5
  )
    gaps.push("Vysoké zadlužení");
  if (goals.length > 0 && (data.investments?.length ?? 0) === 0)
    gaps.push("Chybí investiční plán");

  const persons = data.incomeProtection?.persons ?? [];
  if (persons.length > 0) {
    const hasAnyPlan = persons.some(
      (p) => (p.insurancePlans?.length ?? 0) > 0
    );
    if (!hasAnyPlan) gaps.push("Nevyřešené zajištění příjmů");
  }

  return gaps;
}

function buildViewFromPayload(
  data: FinancialAnalysisData,
  primaryId: string,
  scope: "contact" | "household",
  householdName: string | null,
  status: string,
  updatedAt: Date,
  lastExportedAt: Date | null
): ClientFinancialSummaryView {
  const goals = data.goals ?? [];
  const goalsForDisplay = goals.slice(0, 5).map((g) => ({ name: g.name || "Cíl" }));
  const priorities = goals
    .slice(0, 3)
    .map((g) => g.name || "Cíl")
    .filter(Boolean);

  return {
    primaryAnalysisId: primaryId,
    scope,
    householdName,
    status: status as ClientSummaryAnalysisStatus,
    updatedAt,
    lastExportedAt,
    goals: goalsForDisplay,
    goalsCount: goals.length,
    income: selectTotalIncome(data),
    expenses: selectTotalExpense(data),
    surplus: selectTotalIncome(data) - selectTotalExpense(data),
    assets: selectTotalAssets(data),
    liabilities: selectTotalLiabilities(data),
    netWorth: selectNetWorth(data),
    reserveOk: selectIsReserveMet(data),
    reserveGap: selectReserveGap(data),
    priorities,
    gaps: deriveGaps(data),
  };
}

const EMPTY_VIEW: ClientFinancialSummaryView = {
  primaryAnalysisId: null,
  scope: "contact",
  householdName: null,
  status: "missing",
  updatedAt: null,
  lastExportedAt: null,
  goals: [],
  goalsCount: 0,
  income: 0,
  expenses: 0,
  surplus: 0,
  assets: 0,
  liabilities: 0,
  netWorth: 0,
  reserveOk: false,
  reserveGap: 0,
  priorities: [],
  gaps: [],
};

export async function getClientFinancialSummaryForContact(
  contactId: string
): Promise<ClientFinancialSummaryView> {
  const auth = await requireAuthInAction();
  const isClientPortal =
    auth.roleName === "Client" && auth.contactId === contactId;
  if (!isClientPortal && !hasPermission(auth.roleName, "contacts:read"))
    throw new Error("Forbidden");

  const household = await getHouseholdForContact(contactId);
  const [contactList, householdList] = await Promise.all([
    getFinancialAnalysesForContact(contactId),
    household
      ? getFinancialAnalysesForHousehold(household.id)
      : Promise.resolve([]),
  ]);

  const byId = new Map<
    string,
    { item: FinancialAnalysisListItem; fromHousehold: boolean }
  >();
  for (const item of contactList)
    byId.set(item.id, { item, fromHousehold: false });
  for (const item of householdList) {
    if (!byId.has(item.id)) byId.set(item.id, { item, fromHousehold: true });
  }
  const merged = [...byId.values()];
  const primary = selectPrimaryAnalysis(merged);

  if (!primary) return EMPTY_VIEW;

  const full = await getFinancialAnalysis(primary.item.id);
  if (!full || full.type !== "financial") return EMPTY_VIEW;

  // Client portal: show only completed/exported analyses
  if (isClientPortal && !COMPLETED_STATUSES.has(primary.item.status))
    return EMPTY_VIEW;

  const payload = full.payload as unknown as
    | { data?: FinancialAnalysisData; currentStep?: number }
    | null;
  const data = payload?.data;
  if (!data) {
    if (isClientPortal) return EMPTY_VIEW;
    return buildViewFromPayload(
      {} as FinancialAnalysisData,
      full.id,
      full.householdId ? "household" : "contact",
      full.householdId && household ? household.name : null,
      full.status,
      full.updatedAt,
      full.lastExportedAt
    );
  }

  const scope: "contact" | "household" = full.householdId ? "household" : "contact";
  const householdName =
    scope === "household" && household ? household.name : null;

  return buildViewFromPayload(
    data,
    full.id,
    scope,
    householdName,
    full.status,
    full.updatedAt,
    full.lastExportedAt
  );
}
