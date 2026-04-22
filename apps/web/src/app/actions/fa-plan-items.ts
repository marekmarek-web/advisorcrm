"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { financialAnalyses, faPlanItems, eq, and } from "db";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import { CREDIT_WISH_BANKS } from "@/lib/analyses/financial/constants";
import { getProductName } from "@/lib/analyses/financial/formatters";
import type { FaPlanItemStatus } from "db";

export type FaPlanItemRow = {
  id: string;
  itemType: string;
  itemKey: string | null;
  segmentCode: string | null;
  label: string | null;
  provider: string | null;
  amountMonthly: string | null;
  amountAnnual: string | null;
  status: string;
  contactId: string | null;
  opportunityId: string | null;
  createdAt: Date;
};

export async function getFaPlanItems(analysisId: string): Promise<FaPlanItemRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: faPlanItems.id,
        itemType: faPlanItems.itemType,
        itemKey: faPlanItems.itemKey,
        segmentCode: faPlanItems.segmentCode,
        label: faPlanItems.label,
        provider: faPlanItems.provider,
        amountMonthly: faPlanItems.amountMonthly,
        amountAnnual: faPlanItems.amountAnnual,
        status: faPlanItems.status,
        contactId: faPlanItems.contactId,
        opportunityId: faPlanItems.opportunityId,
        createdAt: faPlanItems.createdAt,
      })
      .from(faPlanItems)
      .where(and(eq(faPlanItems.tenantId, auth.tenantId), eq(faPlanItems.analysisId, analysisId)));
    return rows;
  });
}

export async function updateFaPlanItemStatus(itemId: string, status: FaPlanItemStatus): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await tx
      .update(faPlanItems)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(faPlanItems.tenantId, auth.tenantId), eq(faPlanItems.id, itemId)));
  });
}

const SEGMENT_MAP: Record<string, string> = {
  death: "ZP",
  invalidity: "ZP",
  sickness: "ZP",
  tn: "ZP",
  daily_compensation: "ZP",
  critical_illness: "ZP",
  hospitalization: "ZP",
};

export async function extractFaPlanItems(analysisId: string): Promise<number> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    const [fa] = await tx
      .select({ payload: financialAnalyses.payload, contactId: financialAnalyses.contactId, tenantId: financialAnalyses.tenantId })
      .from(financialAnalyses)
      .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)))
      .limit(1);
    if (!fa) throw new Error("Analýza nenalezena.");

    const data = (fa.payload as { data?: FinancialAnalysisData })?.data;
    if (!data) return 0;

    await tx
      .delete(faPlanItems)
      .where(and(eq(faPlanItems.tenantId, auth.tenantId), eq(faPlanItems.analysisId, analysisId)));

    const items: (typeof faPlanItems.$inferInsert)[] = [];

    const persons = data.incomeProtection?.persons ?? [];
    for (const person of persons) {
      for (const plan of person.insurancePlans ?? []) {
        const monthlyPremium = plan.monthlyPremium ?? (plan.annualContribution ? plan.annualContribution / 12 : undefined);
        const annualPremium = plan.annualContribution ?? (plan.monthlyPremium ? plan.monthlyPremium * 12 : undefined);
        items.push({
          tenantId: fa.tenantId,
          analysisId,
          contactId: fa.contactId,
          itemType: "insurance_plan",
          itemKey: plan.planType === "urazovka" ? "zp_urazovka" : "zp_life",
          segmentCode: "ZP",
          label: `${plan.provider ?? "Pojištění"} – ${person.displayName}`,
          provider: plan.provider,
          amountMonthly: monthlyPremium != null ? String(Math.round(monthlyPremium)) : null,
          amountAnnual: annualPremium != null ? String(Math.round(annualPremium)) : null,
          status: "recommended",
          sourcePayload: plan as unknown as typeof faPlanItems.$inferInsert.sourcePayload,
        });
      }
    }

    for (const inv of data.investments ?? []) {
      if ((inv.amount ?? 0) === 0) continue;
      const segment = inv.type === "pension" ? "DPS" : "INV";
      items.push({
        tenantId: fa.tenantId,
        analysisId,
        contactId: fa.contactId,
        itemType: inv.type === "pension" ? "pension" : "investment",
        itemKey: inv.productKey,
        segmentCode: segment,
        label: getProductName(inv.productKey),
        provider: undefined,
        amountMonthly: inv.type === "monthly" || inv.type === "pension" ? String(Math.round(inv.amount ?? 0)) : null,
        amountAnnual: inv.type === "lump" ? String(Math.round(inv.amount ?? 0)) : null,
        status: "recommended",
        sourcePayload: inv as unknown as typeof faPlanItems.$inferInsert.sourcePayload,
      });
    }

    for (const goal of data.goals ?? []) {
      const segment = goal.type === "hypo" ? "HYPO" : goal.type === "renta" ? "INV" : "INV";
      items.push({
        tenantId: fa.tenantId,
        analysisId,
        contactId: fa.contactId,
        itemType: "goal",
        itemKey: `goal_${goal.type}`,
        segmentCode: segment,
        label: goal.name || goal.type,
        provider: undefined,
        amountMonthly: goal.computed?.pmt != null ? String(Math.round(goal.computed.pmt)) : null,
        amountAnnual: null,
        status: "recommended",
        sourcePayload: goal as unknown as typeof faPlanItems.$inferInsert.sourcePayload,
      });
    }

    for (const credit of data.newCreditWishList ?? []) {
      const bank = CREDIT_WISH_BANKS.find((b) => b.id === credit.selectedBankId);
      const providerName = bank
        ? bank.name
        : credit.selectedBankId === "other"
          ? "Jiná banka"
          : "Nezadáno";
      items.push({
        tenantId: fa.tenantId,
        analysisId,
        contactId: fa.contactId,
        itemType: "credit",
        itemKey: "hypo",
        segmentCode: "HYPO",
        label: `Úvěr ${credit.purpose ?? ""}`.trim(),
        provider: providerName,
        amountMonthly: credit.estimatedMonthly != null ? String(Math.round(credit.estimatedMonthly)) : null,
        amountAnnual: null,
        status: "recommended",
        sourcePayload: credit as unknown as typeof faPlanItems.$inferInsert.sourcePayload,
      });
    }

    if (items.length === 0) return 0;

    await tx.insert(faPlanItems).values(items);
    return items.length;
  });
}

export async function updateFaSaleStatus(
  analysisId: string,
  saleStatus: string,
  saleNotes?: string
): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const now = new Date();
    await tx
      .update(financialAnalyses)
      .set({
        saleStatus,
        saleNotes: saleNotes ?? null,
        soldAt: saleStatus === "sold_full" || saleStatus === "sold_partial" ? now : null,
        updatedAt: now,
        updatedBy: auth.userId,
      } as typeof financialAnalyses.$inferInsert)
      .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)));
  });
}
