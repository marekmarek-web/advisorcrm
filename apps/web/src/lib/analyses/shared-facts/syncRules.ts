/**
 * Sync rules: which fact types exist and how they map to personal FA payload paths.
 * Company → shared (extraction); shared → personal (apply on refresh).
 */

export const SHARED_FACT_TYPES = [
  "income_from_company",
  "dividend_from_company",
  "benefit_company_contribution",
  "guarantee_company_liability",
  "ownership_percent",
  "insurance_company_funded_monthly",
  "company_liability_personal_impact",
] as const;

export type SharedFactType = (typeof SHARED_FACT_TYPES)[number];

/** Personal FA payload paths that can be filled from shared facts. */
export const SHARED_TO_PERSONAL_PATHS: Record<
  SharedFactType,
  string[] | ((contactIndex: number) => string)[]
> = {
  income_from_company: ["cashflow.incomes.main"], // or otherDetails; we use main if single source
  dividend_from_company: ["cashflow.incomes.otherDetails"], // append item
  benefit_company_contribution: [], // informational; company FA side
  guarantee_company_liability: ["liabilities.other"], // or note
  ownership_percent: [], // no direct path; context only
  insurance_company_funded_monthly: ["incomeProtection.persons"], // per-person funding
  company_liability_personal_impact: ["liabilities.other"],
};

/** Fact types that flow from company / company_person_links into shared_facts. */
export const COMPANY_TO_SHARED_FACT_TYPES: SharedFactType[] = [
  "income_from_company",
  "dividend_from_company",
  "benefit_company_contribution",
  "guarantee_company_liability",
  "ownership_percent",
  "insurance_company_funded_monthly",
];

/** Fact types that can be applied into personal FA on refresh. */
export const SHARED_TO_PERSONAL_FACT_TYPES: SharedFactType[] = [
  "income_from_company",
  "dividend_from_company",
  "guarantee_company_liability",
  "insurance_company_funded_monthly",
  "company_liability_personal_impact",
];

export interface SharedFactValue {
  amount?: number;
  periodicity?: "monthly" | "annual";
  currency?: string;
  description?: string;
  [k: string]: unknown;
}

export function getPersonalPathForFactType(
  factType: SharedFactType,
  _contactIndex: number
): string[] {
  const paths = SHARED_TO_PERSONAL_PATHS[factType];
  if (Array.isArray(paths) && (paths.length === 0 || typeof paths[0] === "string")) return paths as string[];
  return (paths as ((contactIndex: number) => string)[]).map((fn) => fn(_contactIndex));
}
