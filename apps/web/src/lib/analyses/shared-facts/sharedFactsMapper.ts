/**
 * Map company FA payload and company_person_links → shared fact records.
 * Map shared facts → proposed personal FA payload (for refresh/diff).
 */

import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import type { SharedFactType } from "./syncRules";
import { type SharedFactValue } from "./syncRules";

export interface SharedFactRecord {
  factType: string;
  value: SharedFactValue;
  source: "company_fa" | "json_import" | "manual" | "crm_link";
  contactId?: string | null;
  companyId: string;
  companyPersonLinkId?: string | null;
  sourceAnalysisId?: string | null;
  sourcePayloadPath?: string | null;
}

export interface CompanyPersonLinkRow {
  id: string;
  contactId: string | null;
  roleType: string;
  ownershipPercent: number | null;
  salaryFromCompanyMonthly: number | null;
  dividendRelation: string | null;
  guaranteesCompanyLiabilities: boolean | null;
}

/**
 * Build shared fact records from company FA payload and company_person_links.
 * Used after company FA save or company JSON import.
 */
export function companyPayloadAndLinksToSharedFacts(
  companyPayload: CompanyFaPayload,
  links: CompanyPersonLinkRow[],
  companyId: string,
  sourceAnalysisId: string | null,
  source: "company_fa" | "json_import"
): SharedFactRecord[] {
  const records: SharedFactRecord[] = [];
  const directors = companyPayload.directors ?? [];
  const benefits = companyPayload.benefits;

  directors.forEach((dir, idx) => {
    const link = links[idx] ?? null;
    const contactId = link?.contactId ?? null;
    const linkId = link?.id ?? null;

    if (dir.netIncome != null && dir.netIncome > 0) {
      records.push({
        factType: "income_from_company",
        value: { amount: dir.netIncome, periodicity: "monthly", currency: "CZK" },
        source,
        contactId,
        companyId,
        companyPersonLinkId: linkId,
        sourceAnalysisId,
        sourcePayloadPath: `directors[${idx}].netIncome`,
      });
    }

    if (link?.ownershipPercent != null && link.ownershipPercent > 0) {
      records.push({
        factType: "ownership_percent",
        value: { amount: link.ownershipPercent, currency: "percent" },
        source,
        contactId,
        companyId,
        companyPersonLinkId: linkId,
        sourceAnalysisId,
        sourcePayloadPath: null,
      });
    }

    if (link?.guaranteesCompanyLiabilities) {
      const loanPayment = companyPayload.finance?.loanPayment ?? 0;
      records.push({
        factType: "guarantee_company_liability",
        value: {
          amount: loanPayment,
          periodicity: "monthly",
          description: "Ručení za firemní závazky",
        },
        source,
        contactId,
        companyId,
        companyPersonLinkId: linkId,
        sourceAnalysisId,
        sourcePayloadPath: "finance.loanPayment",
      });
    }

    if (link?.salaryFromCompanyMonthly != null && link.salaryFromCompanyMonthly > 0) {
      records.push({
        factType: "income_from_company",
        value: {
          amount: link.salaryFromCompanyMonthly,
          periodicity: "monthly",
          currency: "CZK",
        },
        source,
        contactId,
        companyId,
        companyPersonLinkId: linkId,
        sourceAnalysisId,
        sourcePayloadPath: null,
      });
    }

    if (dir.benefits?.amountMonthly != null && dir.benefits.amountMonthly > 0) {
      records.push({
        factType: "insurance_company_funded_monthly",
        value: {
          amount: dir.benefits.amountMonthly,
          periodicity: "monthly",
          currency: "CZK",
        },
        source,
        contactId,
        companyId,
        companyPersonLinkId: linkId,
        sourceAnalysisId,
        sourcePayloadPath: `directors[${idx}].benefits.amountMonthly`,
      });
    }
  });

  if (benefits?.directorsAmount != null && benefits.directorsAmount > 0 && links.length > 0) {
    const perPerson = Math.round(benefits.directorsAmount / Math.max(1, links.length));
    links.forEach((link, idx) => {
      records.push({
        factType: "benefit_company_contribution",
        value: { amount: perPerson, periodicity: "monthly", currency: "CZK" },
        source,
        contactId: link.contactId ?? null,
        companyId,
        companyPersonLinkId: link.id,
        sourceAnalysisId,
        sourcePayloadPath: "benefits.directorsAmount",
      });
    });
  }

  return records;
}

export interface SharedFactForApply {
  id: string;
  factType: string;
  value: SharedFactValue;
  contactId: string | null;
  companyId: string;
}

/**
 * Build a proposed partial personal payload from shared facts (for diff and apply).
 * Only includes paths that shared facts can fill; does not touch other keys.
 */
export function sharedFactsToProposedPersonalPatch(
  facts: SharedFactForApply[],
  currentPayload: FinancialAnalysisData
): Partial<FinancialAnalysisData> {
  const patch: Partial<FinancialAnalysisData> = {};
  const incomeFromCompany = facts.find((f) => f.factType === "income_from_company");
  const dividend = facts.find((f) => f.factType === "dividend_from_company");
  const guarantee = facts.find((f) => f.factType === "guarantee_company_liability");
  const insuranceFunded = facts.find((f) => f.factType === "insurance_company_funded_monthly");

  const cf = currentPayload.cashflow ?? {};
  const inc = cf.incomes ?? {};
  let main = inc.main;
  let otherDetails = [...(inc.otherDetails ?? [])];

  if (incomeFromCompany?.value?.amount != null && incomeFromCompany.value.amount > 0) {
    main = incomeFromCompany.value.amount as number;
  }
  if (dividend?.value?.amount != null && dividend.value.amount > 0) {
    const nextId = otherDetails.length > 0 ? Math.max(...otherDetails.map((o) => o.id)) + 1 : 1;
    otherDetails = [
      ...otherDetails,
      { id: nextId, desc: "Dividenda / podíl na zisku", amount: dividend.value.amount as number },
    ];
  }
  const hasIncomeChange =
    (incomeFromCompany?.value?.amount != null && incomeFromCompany.value.amount > 0) ||
    (dividend?.value?.amount != null && dividend.value.amount > 0);
  if (hasIncomeChange) {
    patch.cashflow = {
      ...cf,
      incomes: { ...inc, ...(main !== undefined && { main }), otherDetails },
    } as FinancialAnalysisData["cashflow"];
  }

  if (guarantee?.value?.amount != null && guarantee.value.amount > 0) {
    const currentOther = currentPayload.liabilities?.other ?? 0;
    patch.liabilities = {
      ...currentPayload.liabilities,
      other: currentOther + (guarantee.value.amount as number),
    } as FinancialAnalysisData["liabilities"];
  }

  if (insuranceFunded?.value?.amount != null && insuranceFunded.value.amount > 0) {
    const persons = currentPayload.incomeProtection?.persons ?? [];
    const amount = insuranceFunded.value.amount as number;
    const updated = persons.map((p, i) =>
      i === 0
        ? {
            ...p,
            funding: {
              ...p.funding,
              benefitOptimizationEnabled: p.funding?.benefitOptimizationEnabled ?? true,
              companyContributionMonthly: amount,
              companyContributionAnnual: amount * 12,
            },
          }
        : p
    );
    patch.incomeProtection = { persons: updated };
  }

  return patch;
}
