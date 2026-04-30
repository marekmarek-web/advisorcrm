import type { ContractBjCalculation, PortfolioAttributes } from "db";
import type { ContractSegmentUiGroup } from "@/lib/contracts/contract-segment-wizard-config";

export type ClientAmountType =
  | "investment_principal"
  | "loan_principal"
  | "monthly_premium"
  | "annual_premium"
  | "entry_fee"
  | "participant_contribution"
  | "one_time_payment"
  | "unknown";

export type ProductionBasis =
  | "annual_premium"
  | "monthly_premium_to_annual"
  | "entry_fee"
  | "invested_amount_rate"
  | "loan_amount_rate"
  | "contribution_with_cap"
  | "fixed_bj"
  | "manual_override";

export type ProductionCalculationTrace = {
  inputValue: number | null;
  normalizedInputValue: number | null;
  rate: number | null;
  multiplier: number | null;
  cap: number | null;
  annualizedValue: number | null;
  resultBj: number | null;
  warnings: string[];
};

export type ProductionCalculationStatus = "calculated" | "missing_rule" | "manual_review" | "manual_override";

export type ProductionContractSource = {
  id: string;
  contactId: string;
  segment: string;
  segmentLabel: string;
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  startDate: string | null;
  productionDate: string | null;
  premiumAmount: string | number | null;
  premiumAnnual: string | number | null;
  portfolioAttributes: PortfolioAttributes | Record<string, unknown> | null;
  bjUnits: string | number | null;
  bjCalculation: ContractBjCalculation | null;
};

export type ProductionContractReadModel = {
  id: string;
  contactId: string;
  segment: string;
  segmentLabel: string;
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  startDate: string | null;
  productionDate: string | null;
  clientAmount: number | null;
  clientAmountType: ClientAmountType;
  clientAmountLabel: string;
  productionBj: number | null;
  productionRuleId: string | null;
  productionRuleName: string | null;
  productionBasis: ProductionBasis;
  productionCalculationTrace: ProductionCalculationTrace;
  isProductionCalculated: boolean;
  productionWarnings: string[];
  calculationStatus: ProductionCalculationStatus;
  premiumAmount: number;
  premiumAnnual: number;
};

export type ProductionSegmentReadModel = {
  segment: string;
  segmentLabel: string;
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  clientAmountTotal: number;
  clientAnnualEquivalentTotal: number;
  productionBj: number;
  count: number;
  calculatedCount: number;
  missingRuleCount: number;
  manualReviewCount: number;
  productionWarnings: string[];
};

export type ProductionAggregation = {
  rows: ProductionSegmentReadModel[];
  contracts: ProductionContractReadModel[];
  totalClientAmount: number;
  totalClientAnnualEquivalent: number;
  totalProductionBj: number;
  totalCount: number;
  calculatedCount: number;
  missingRuleCount: number;
  manualReviewCount: number;
};

const MISSING_RULE_WARNING = "Chybí produkční pravidlo v katalogu";

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value
    .trim()
    .replace(/[\u00A0\u202F]/g, "")
    .replace(/\s+/g, "")
    .replace(/kč|czk/gi, "")
    .replace(/'/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstAmount(attrs: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(attrs[key] as string | number | null | undefined);
    if (value != null && value > 0) return value;
  }
  return null;
}

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function isManualOverride(calc: ContractBjCalculation | null): boolean {
  return calc?.formula === "manual_override";
}

function formulaToBasis(
  formula: ContractBjCalculation["formula"] | "manual_override" | undefined,
  clientAmountType: ClientAmountType,
): ProductionBasis {
  switch (formula) {
    case "entry_fee":
      return "entry_fee";
    case "client_contribution":
      return "contribution_with_cap";
    case "loan_principal":
      return "loan_amount_rate";
    case "investment_amount":
      return "invested_amount_rate";
    case "manual_override":
      return "manual_override";
    case "annual_premium":
      return clientAmountType === "monthly_premium" ? "monthly_premium_to_annual" : "annual_premium";
    default:
      return "annual_premium";
  }
}

export function getProductionBasisLabel(basis: ProductionBasis): string {
  switch (basis) {
    case "entry_fee":
      return "Vstupní poplatek";
    case "contribution_with_cap":
      return "Příspěvek s capem";
    case "loan_amount_rate":
      return "Jistina úvěru × sazba";
    case "invested_amount_rate":
      return "Investovaná částka × sazba";
    case "monthly_premium_to_annual":
      return "Měsíční pojistné → roční × koeficient";
    case "annual_premium":
      return "Roční pojistné × koeficient";
    case "fixed_bj":
      return "Fixní BJ";
    case "manual_override":
      return "Ruční úprava BJ";
  }
}

export function getClientAmountTypeLabel(type: ClientAmountType): string {
  switch (type) {
    case "investment_principal":
      return "Investice klienta";
    case "loan_principal":
      return "Výše úvěru";
    case "monthly_premium":
      return "Měsíční pojistné";
    case "annual_premium":
      return "Roční pojistné";
    case "entry_fee":
      return "Vstupní poplatek";
    case "participant_contribution":
      return "Příspěvek účastníka";
    case "one_time_payment":
      return "Jednorázová platba";
    case "unknown":
      return "Vstup nezjištěn";
  }
}

function ruleId(calc: ContractBjCalculation | null): string | null {
  if (!calc?.matchedRule) return null;
  const rule = calc.matchedRule;
  return [
    rule.tenantScope,
    rule.productCategory,
    rule.partnerPattern ?? "default",
    rule.subtype ?? "any",
  ].join(":");
}

export function getProductionRuleName(calc: ContractBjCalculation | null): string | null {
  if (!calc) return null;
  if (isManualOverride(calc)) return "Ruční úprava BJ";
  return getProductionBasisLabel(formulaToBasis(calc.formula, "unknown"));
}

function deriveClientAmount(row: ProductionContractSource): {
  amount: number | null;
  type: ClientAmountType;
  annualizedValue: number | null;
} {
  const attrs = (row.portfolioAttributes ?? {}) as Record<string, unknown>;
  const premiumAmount = toNumber(row.premiumAmount);
  const premiumAnnual = toNumber(row.premiumAnnual);
  const formula = row.bjCalculation?.formula;

  if (formula === "entry_fee") {
    return { amount: firstAmount(attrs, ["entryFee", "entry_fee"]), type: "entry_fee", annualizedValue: null };
  }
  if (formula === "client_contribution") {
    return {
      amount: firstAmount(attrs, ["participantContribution", "clientContributionMonthly"]),
      type: "participant_contribution",
      annualizedValue: null,
    };
  }
  if (formula === "loan_principal") {
    return { amount: firstAmount(attrs, ["loanPrincipal", "loanAmount", "principal"]), type: "loan_principal", annualizedValue: null };
  }
  if (formula === "investment_amount") {
    return {
      amount: firstAmount(attrs, ["targetAmount", "investmentAmount", "intendedInvestment"]) ?? premiumAmount ?? premiumAnnual,
      type: "investment_principal",
      annualizedValue: null,
    };
  }
  if (formula === "annual_premium") {
    if (premiumAmount != null && premiumAmount > 0) {
      return { amount: premiumAmount, type: "monthly_premium", annualizedValue: premiumAnnual ?? premiumAmount * 12 };
    }
    return { amount: premiumAnnual, type: "annual_premium", annualizedValue: premiumAnnual };
  }

  if (row.group === "lending") {
    return { amount: firstAmount(attrs, ["loanPrincipal", "loanAmount", "principal"]) ?? premiumAnnual ?? premiumAmount, type: "loan_principal", annualizedValue: null };
  }
  if (row.group === "investment") {
    const entryFee = firstAmount(attrs, ["entryFee", "entry_fee"]);
    if (entryFee != null) return { amount: entryFee, type: "entry_fee", annualizedValue: null };
    const contribution = firstAmount(attrs, ["participantContribution", "clientContributionMonthly"]);
    if (contribution != null) return { amount: contribution, type: "participant_contribution", annualizedValue: null };
    return {
      amount: firstAmount(attrs, ["targetAmount", "investmentAmount", "intendedInvestment"]) ?? premiumAmount ?? premiumAnnual,
      type: "investment_principal",
      annualizedValue: null,
    };
  }
  if (premiumAmount != null && premiumAmount > 0) {
    return { amount: premiumAmount, type: "monthly_premium", annualizedValue: premiumAnnual ?? premiumAmount * 12 };
  }
  if (premiumAnnual != null && premiumAnnual > 0) {
    return { amount: premiumAnnual, type: "annual_premium", annualizedValue: premiumAnnual };
  }
  return { amount: null, type: "unknown", annualizedValue: null };
}

export function mapProductionContract(row: ProductionContractSource): ProductionContractReadModel {
  const productionBj = toNumber(row.bjUnits);
  const calc = row.bjCalculation;
  const client = deriveClientAmount(row);
  const notes = uniqueWarnings(calc?.notes ?? []);
  const missingRule =
    productionBj == null &&
    (calc == null ||
      notes.some((note) => note.toLowerCase().includes("nebylo nalezeno") || note.toLowerCase().includes("chybí produkční pravidlo")));
  const warnings = uniqueWarnings([
    ...notes,
    missingRule ? MISSING_RULE_WARNING : "",
    productionBj == null && !missingRule && !isManualOverride(calc) ? "Ruční kontrola výpočtu produkce" : "",
  ]);
  const basis = formulaToBasis(calc?.formula, client.type);
  const calculationStatus: ProductionCalculationStatus = isManualOverride(calc)
    ? "manual_override"
    : productionBj != null
      ? "calculated"
      : missingRule
        ? "missing_rule"
        : "manual_review";

  return {
    id: row.id,
    contactId: row.contactId,
    segment: row.segment,
    segmentLabel: row.segmentLabel,
    group: row.group,
    partnerName: row.partnerName,
    productName: row.productName,
    contractNumber: row.contractNumber,
    startDate: row.startDate,
    productionDate: row.productionDate,
    clientAmount: client.amount,
    clientAmountType: client.type,
    clientAmountLabel: getClientAmountTypeLabel(client.type),
    productionBj,
    productionRuleId: ruleId(calc),
    productionRuleName: getProductionRuleName(calc) ?? (missingRule ? MISSING_RULE_WARNING : null),
    productionBasis: basis,
    productionCalculationTrace: {
      inputValue: calc?.amountRawCzk ?? client.amount,
      normalizedInputValue: calc?.amountCzk ?? null,
      rate: calc?.coefficient ?? null,
      multiplier: calc?.coefficient ?? null,
      cap: calc?.cap ?? null,
      annualizedValue: client.annualizedValue,
      resultBj: productionBj,
      warnings,
    },
    isProductionCalculated: productionBj != null,
    productionWarnings: warnings,
    calculationStatus,
    premiumAmount: toNumber(row.premiumAmount) ?? 0,
    premiumAnnual: toNumber(row.premiumAnnual) ?? 0,
  };
}

export function aggregateProductionContracts(contracts: ProductionContractReadModel[]): ProductionAggregation {
  const bySegment = new Map<string, ProductionSegmentReadModel>();
  for (const row of contracts) {
    const key = `${row.segment}::${row.partnerName ?? ""}`;
    const existing = bySegment.get(key);
    const target =
      existing ??
      {
        segment: row.segment,
        segmentLabel: row.segmentLabel,
        group: row.group,
        partnerName: row.partnerName,
        clientAmountTotal: 0,
        clientAnnualEquivalentTotal: 0,
        productionBj: 0,
        count: 0,
        calculatedCount: 0,
        missingRuleCount: 0,
        manualReviewCount: 0,
        productionWarnings: [],
      };
    target.clientAmountTotal += row.clientAmount ?? 0;
    target.clientAnnualEquivalentTotal += row.premiumAnnual;
    target.productionBj += row.productionBj ?? 0;
    target.count += 1;
    if (row.isProductionCalculated) target.calculatedCount += 1;
    if (row.calculationStatus === "missing_rule") target.missingRuleCount += 1;
    if (row.calculationStatus === "manual_review") target.manualReviewCount += 1;
    target.productionWarnings = uniqueWarnings([...target.productionWarnings, ...row.productionWarnings]);
    bySegment.set(key, target);
  }

  const rows = Array.from(bySegment.values()).sort((a, b) => b.productionBj - a.productionBj);
  return {
    rows,
    contracts,
    totalClientAmount: contracts.reduce((sum, row) => sum + (row.clientAmount ?? 0), 0),
    totalClientAnnualEquivalent: contracts.reduce((sum, row) => sum + row.premiumAnnual, 0),
    totalProductionBj: contracts.reduce((sum, row) => sum + (row.productionBj ?? 0), 0),
    totalCount: contracts.length,
    calculatedCount: contracts.filter((row) => row.isProductionCalculated).length,
    missingRuleCount: contracts.filter((row) => row.calculationStatus === "missing_rule").length,
    manualReviewCount: contracts.filter((row) => row.calculationStatus === "manual_review").length,
  };
}
