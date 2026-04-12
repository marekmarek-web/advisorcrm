/**
 * Client-facing portfolio read model: aggregations and segment grouping.
 * Source of truth: normalized `contracts` rows approved for the client portal.
 */

import type { PortfolioPersonEntry, PortfolioRiskEntry } from "@/lib/portfolio/build-portfolio-attributes-from-extract";

export type PortfolioUiGroup =
  | "investments_pensions"
  | "loans"
  | "income_protection_life"
  | "children"
  | "property_liability"
  | "vehicles"
  | "travel"
  | "business"
  | "other";

const INVESTMENT_SEGMENTS = new Set(["INV", "DIP", "DPS"]);
const LOAN_SEGMENTS = new Set(["HYPO", "UVER"]);
const PROPERTY_SEGMENTS = new Set(["MAJ", "ODP"]);
const VEHICLE_SEGMENTS = new Set(["AUTO_PR", "AUTO_HAV"]);
/** Risk / life – adult-oriented; child-specific rows use portfolio_attributes.subcategory === "child_coverage". */
const LIFE_RISK_SEGMENTS = new Set(["ZP"]);

export function segmentToPortfolioGroup(
  segment: string,
  attributes: Record<string, unknown> | null | undefined
): PortfolioUiGroup {
  const sub = attributes && typeof attributes.subcategory === "string" ? attributes.subcategory : "";
  if (sub === "child_coverage" || sub === "children") {
    return "children";
  }
  if (INVESTMENT_SEGMENTS.has(segment)) return "investments_pensions";
  if (LOAN_SEGMENTS.has(segment)) return "loans";
  if (LIFE_RISK_SEGMENTS.has(segment)) return "income_protection_life";
  if (PROPERTY_SEGMENTS.has(segment)) return "property_liability";
  if (VEHICLE_SEGMENTS.has(segment)) return "vehicles";
  if (segment === "CEST") return "travel";
  if (segment === "FIRMA_POJ") return "business";
  return "other";
}

export type PortfolioMetrics = {
  monthlyInvestments: number;
  /** Sum of monthly premium/contribution fields for non-investment, non-loan insurance products. */
  monthlyInsurancePremiums: number;
  /** From portfolio_attributes.loanPrincipal when parseable; else 0 for v1. */
  totalLoanPrincipal: number;
  activeContractCount: number;
};

function toNumber(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function principalFromAttributes(row: {
  segment: string;
  portfolioAttributes: Record<string, unknown> | null;
}): number {
  if (!LOAN_SEGMENTS.has(row.segment)) return 0;
  const attrs = row.portfolioAttributes ?? {};
  const raw = attrs.loanPrincipal ?? attrs.loan_amount ?? attrs.principalAmount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") return toNumber(raw);
  return 0;
}

/** Aggregates for dashboard / KPI cards — only meaningful fields from normalized data. */
export function aggregatePortfolioMetrics(
  rows: Array<{
    segment: string;
    premiumAmount: string | null;
    premiumAnnual: string | null;
    portfolioAttributes: Record<string, unknown> | null;
  }>
): PortfolioMetrics {
  let monthlyInvestments = 0;
  let monthlyInsurancePremiums = 0;
  let totalLoanPrincipal = 0;
  let activeContractCount = 0;

  for (const row of rows) {
    activeContractCount += 1;
    const monthly = toNumber(row.premiumAmount);
    const annual = toNumber(row.premiumAnnual);
    totalLoanPrincipal += principalFromAttributes(row);

    if (INVESTMENT_SEGMENTS.has(row.segment)) {
      // Annual investment contributions normalised to monthly equivalent
      if (monthly > 0) monthlyInvestments += monthly;
      else if (annual > 0) monthlyInvestments += annual / 12;
      continue;
    }
    if (LOAN_SEGMENTS.has(row.segment)) {
      /** Monthly loan payment if stored in premium_amount (CRM convention). */
      continue;
    }
    /** Insurance-style segments: monthly premium sum (all non-investment, non-loan segments) */
    if (monthly > 0) monthlyInsurancePremiums += monthly;
    else if (annual > 0) monthlyInsurancePremiums += annual / 12;
  }

  return {
    monthlyInvestments: Math.round(monthlyInvestments),
    monthlyInsurancePremiums: Math.round(monthlyInsurancePremiums),
    totalLoanPrincipal: Math.round(totalLoanPrincipal),
    activeContractCount,
  };
}

export const PORTFOLIO_GROUP_LABELS: Record<PortfolioUiGroup, string> = {
  investments_pensions: "Investice a penze",
  loans: "Hypotéky a úvěry",
  income_protection_life: "Zajištění příjmů a životní pojištění",
  children: "Pojištění dětí",
  property_liability: "Majetek a odpovědnost",
  vehicles: "Vozidla",
  travel: "Cestovní pojištění",
  business: "Firemní pojištění",
  other: "Ostatní",
};

function isPortfolioPersonEntry(x: unknown): x is PortfolioPersonEntry {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.role === "string" &&
    ["policyholder", "insured", "child", "beneficiary", "other"].includes(r.role)
  );
}

function isPortfolioRiskEntry(x: unknown): x is PortfolioRiskEntry {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return typeof r.label === "string" && r.label.trim().length > 0;
}

/** Osoby z `portfolio_attributes.persons` (P2 / AI review). */
export function portfolioPersonsFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): PortfolioPersonEntry[] {
  const raw = attributes?.persons;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPortfolioPersonEntry);
}

/** Rizika / připojištění z `portfolio_attributes.risks` (P2 / AI review). */
export function portfolioRisksFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): PortfolioRiskEntry[] {
  const raw = attributes?.risks;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPortfolioRiskEntry);
}
