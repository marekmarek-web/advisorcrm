/**
 * Canonical product read layer.
 *
 * Single mapping from a raw contract row (+ portfolio_attributes JSONB) to a
 * typed, per-segment product view object.
 *
 * Every consumer — client portal, advisor detail, financial analysis —
 * MUST use this module to interpret contract data. No parallel interpretations.
 */

import type {
  PortfolioAttributes,
  PortfolioPersonEntry,
  PortfolioRiskEntry,
  CoverageLineUi,
  ResolvedFundCategory,
  FvSourceType,
} from "db";
import { dedupePortfolioRisks } from "@/lib/portfolio/portfolio-risks-dedupe";

// ---------------------------------------------------------------------------
// Raw contract input (minimal shape accepted from any query layer)
// ---------------------------------------------------------------------------

export type RawContractInput = {
  id: string;
  contactId: string;
  segment: string;
  type: string;
  partnerId: string | null;
  productId: string | null;
  partnerName: string | null;
  productName: string | null;
  premiumAmount: string | null;
  premiumAnnual: string | null;
  contractNumber: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
  note: string | null;
  visibleToClient: boolean;
  portfolioStatus: string;
  sourceKind: string;
  portfolioAttributes: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Canonical product — shared output
// ---------------------------------------------------------------------------

export type CanonicalProduct = {
  id: string;
  contactId: string;
  segment: string;
  segmentLabel: string;
  partnerName: string | null;
  productName: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  contractNumber: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
  portfolioStatus: string;
  sourceKind: string;
  visibleToClient: boolean;

  /** Per-segment typed detail — null when segment has no special fields. */
  segmentDetail: SegmentDetail | null;

  /** FV readiness — always populated from portfolioAttributes. */
  fvReadiness: FvReadiness;
};

// ---------------------------------------------------------------------------
// FV readiness
// ---------------------------------------------------------------------------

export type FvReadiness = {
  resolvedFundId: string | null;
  resolvedFundCategory: ResolvedFundCategory | null;
  fvSourceType: FvSourceType | null;
  investmentHorizon: string | null;
  monthlyAmount: number | null;
  targetAmount: number | null;
  expectedFutureValue: string | null;
};

// ---------------------------------------------------------------------------
// Per-segment detail discriminated union
// ---------------------------------------------------------------------------

export type SegmentDetail =
  | InvestmentDetail
  | LifeInsuranceDetail
  | VehicleDetail
  | PropertyDetail
  | PensionDetail
  | LoanDetail;

export type InvestmentDetail = {
  kind: "investment";
  institution: string | null;
  fundName: string | null;
  fundAllocation: string | null;
  investmentStrategy: string | null;
  investmentHorizon: string | null;
  monthlyContribution: number | null;
  targetAmount: string | null;
  resolvedFundId: string | null;
  resolvedFundCategory: ResolvedFundCategory | null;
  fvSourceType: FvSourceType | null;
};

export type LifeInsuranceDetail = {
  kind: "life_insurance";
  insurer: string | null;
  startDate: string | null;
  endDate: string | null;
  monthlyPremium: number | null;
  annualPremium: number | null;
  sumInsured: string | null;
  persons: PortfolioPersonEntry[];
  risks: PortfolioRiskEntry[];
  generalPractitioner: string | null;
  /** Číslo OP / pas z dokumentu (portfolio_attributes), obvykle u pojistníka. */
  idCardNumber: string | null;
  paymentVariableSymbol?: string | null;
  paymentAccountDisplay?: string | null;
  paymentFrequencyLabel?: string | null;
  extraPaymentAccountDisplay?: string | null;
  investmentStrategy?: string | null;
  investmentPremiumLabel?: string | null;
};

export type VehicleDetail = {
  kind: "vehicle";
  subtype: "POV" | "HAV";
  vehicleRegistration: string | null;
  insurer: string | null;
  coverageLines: CoverageLineUi[];
};

export type PropertyDetail = {
  kind: "property";
  subtype: "property" | "liability";
  propertyAddress: string | null;
  insurer: string | null;
  coverageLines: CoverageLineUi[];
  sumInsured: string | null;
};

export type PensionDetail = {
  kind: "pension";
  company: string | null;
  participantContribution: string | null;
  participantContributionNumeric: number | null;
  employerContribution: string | null;
  stateContributionEstimate: string | null;
  investmentStrategy: string | null;
  investmentHorizon: string | null;
};

export type LoanDetail = {
  kind: "loan";
  lender: string | null;
  loanPrincipal: string | null;
  monthlyPayment: number | null;
  fixationUntil: string | null;
  maturityDate: string | null;
  interestRate: string | null;
};

// ---------------------------------------------------------------------------
// Segment label map (no DB import — safe for client bundle)
// ---------------------------------------------------------------------------

const SEGMENT_LABEL_MAP: Record<string, string> = {
  ZP: "Životní pojištění",
  MAJ: "Majetek",
  ODP: "Odpovědnost",
  AUTO_PR: "Auto – povinné ručení",
  AUTO_HAV: "Auto – havarijní pojištění",
  CEST: "Cestovní pojištění",
  INV: "Investice",
  DIP: "Dlouhodobý investiční produkt (DIP)",
  DPS: "Doplňkové penzijní spoření (DPS)",
  HYPO: "Hypotéky",
  UVER: "Úvěry",
  FIRMA_POJ: "Pojištění firem",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function safeString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function safePersons(raw: unknown): PortfolioPersonEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is PortfolioPersonEntry =>
      !!x &&
      typeof x === "object" &&
      typeof (x as Record<string, unknown>).role === "string",
  );
}

function safeRisks(raw: unknown): PortfolioRiskEntry[] {
  if (!Array.isArray(raw)) return [];
  const filtered = raw.filter(
    (x): x is PortfolioRiskEntry =>
      !!x &&
      typeof x === "object" &&
      typeof (x as Record<string, unknown>).label === "string",
  );
  return dedupePortfolioRisks(filtered);
}

function safeCoverageLines(raw: unknown): CoverageLineUi[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is CoverageLineUi => !!x && typeof x === "object",
  );
}

function firstFundName(attrs: Record<string, unknown>): string | null {
  const funds = attrs.investmentFunds;
  if (!Array.isArray(funds) || funds.length === 0) return null;
  const first = funds[0] as { name?: string } | undefined;
  return safeString(first?.name);
}

function firstFundAllocation(attrs: Record<string, unknown>): string | null {
  const funds = attrs.investmentFunds;
  if (!Array.isArray(funds) || funds.length === 0) return null;
  const first = funds[0] as { allocation?: string } | undefined;
  return safeString(first?.allocation);
}

function isGenericInvestmentMarketingLabel(name: string | null | undefined): boolean {
  if (!name || !String(name).trim()) return false;
  const n = String(name).toLowerCase();
  return (
    /\b(rytmus|pravideln|investov|platform|program|balíč|balic|servis|předběž|predbez)\b/i.test(n) &&
    !/\b(etf|ucits|fond|fund|msci|index|akci|dluhopis|bond|strategy|strategi|ishares)\b/i.test(n)
  );
}

/** Prefer concrete fund / ETF name over generic platform marketing for pure investment segments. */
function resolveDisplayProductName(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): string | null {
  const inv = new Set(["INV", "DIP"]);
  if (!inv.has(contract.segment)) return contract.productName;
  const fund = firstFundName(attrs);
  const marketing = contract.productName;
  if (fund && marketing && isGenericInvestmentMarketingLabel(marketing) && !isGenericInvestmentMarketingLabel(fund)) {
    return fund;
  }
  return marketing ?? fund ?? null;
}

// ---------------------------------------------------------------------------
// Per-segment detail builders
// ---------------------------------------------------------------------------

function buildInvestmentDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): InvestmentDetail {
  return {
    kind: "investment",
    institution: contract.partnerName,
    fundName: firstFundName(attrs),
    fundAllocation: firstFundAllocation(attrs),
    investmentStrategy: safeString(attrs.investmentStrategy),
    investmentHorizon: safeString(attrs.investmentHorizon),
    monthlyContribution: safeNumber(contract.premiumAmount),
    targetAmount: safeString(attrs.targetAmount),
    resolvedFundId: safeString(attrs.resolvedFundId),
    resolvedFundCategory: (attrs.resolvedFundCategory as ResolvedFundCategory) ?? null,
    fvSourceType: (attrs.fvSourceType as FvSourceType) ?? null,
  };
}

function buildLifeInsuranceDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): LifeInsuranceDetail {
  return {
    kind: "life_insurance",
    insurer: contract.partnerName,
    startDate: contract.startDate,
    endDate: contract.anniversaryDate,
    monthlyPremium: safeNumber(contract.premiumAmount),
    annualPremium: safeNumber(contract.premiumAnnual),
    sumInsured: safeString(attrs.sumInsured),
    persons: safePersons(attrs.persons),
    risks: safeRisks(attrs.risks),
    generalPractitioner: safeString(attrs.generalPractitioner),
    idCardNumber: safeString(attrs.idCardNumber),
    paymentVariableSymbol: safeString(attrs.paymentVariableSymbol),
    paymentAccountDisplay: safeString(attrs.paymentAccountDisplay),
    paymentFrequencyLabel: safeString(attrs.paymentFrequencyLabel),
    extraPaymentAccountDisplay: safeString(attrs.extraPaymentAccountDisplay),
    investmentStrategy: safeString(attrs.investmentStrategy),
    investmentPremiumLabel: safeString(attrs.investmentPremiumLabel),
  };
}

function buildVehicleDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): VehicleDetail {
  return {
    kind: "vehicle",
    subtype: contract.segment === "AUTO_HAV" ? "HAV" : "POV",
    vehicleRegistration: safeString(attrs.vehicleRegistration),
    insurer: contract.partnerName,
    coverageLines: safeCoverageLines(attrs.coverageLines),
  };
}

function buildPropertyDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): PropertyDetail {
  return {
    kind: "property",
    subtype: contract.segment === "ODP" ? "liability" : "property",
    propertyAddress: safeString(attrs.propertyAddress),
    insurer: contract.partnerName,
    coverageLines: safeCoverageLines(attrs.coverageLines),
    sumInsured: safeString(attrs.sumInsured),
  };
}

function buildPensionDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): PensionDetail {
  return {
    kind: "pension",
    company: contract.partnerName,
    participantContribution: safeString(attrs.participantContribution),
    participantContributionNumeric: safeNumber(attrs.participantContribution),
    employerContribution: safeString(attrs.employerContribution),
    stateContributionEstimate: safeString(attrs.stateContributionEstimate),
    investmentStrategy: safeString(attrs.investmentStrategy),
    investmentHorizon: safeString(attrs.investmentHorizon),
  };
}

function buildLoanDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): LoanDetail {
  return {
    kind: "loan",
    lender: contract.partnerName,
    loanPrincipal: safeString(attrs.loanPrincipal),
    monthlyPayment: safeNumber(contract.premiumAmount),
    fixationUntil: safeString(attrs.loanFixationUntil),
    maturityDate: safeString(attrs.loanMaturityDate),
    interestRate: safeString(attrs.loanInterestRate),
  };
}

// ---------------------------------------------------------------------------
// Segment → detail dispatcher
// ---------------------------------------------------------------------------

const INVESTMENT_SEGMENTS = new Set(["INV", "DIP"]);
const PENSION_SEGMENTS = new Set(["DPS"]);
const LOAN_SEGMENTS = new Set(["HYPO", "UVER"]);
const VEHICLE_SEGMENTS = new Set(["AUTO_PR", "AUTO_HAV"]);
const PROPERTY_SEGMENTS = new Set(["MAJ", "ODP"]);
const LIFE_SEGMENTS = new Set(["ZP"]);

function buildSegmentDetail(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): SegmentDetail | null {
  const seg = contract.segment;
  if (INVESTMENT_SEGMENTS.has(seg)) return buildInvestmentDetail(contract, attrs);
  if (PENSION_SEGMENTS.has(seg)) return buildPensionDetail(contract, attrs);
  if (LIFE_SEGMENTS.has(seg)) return buildLifeInsuranceDetail(contract, attrs);
  if (VEHICLE_SEGMENTS.has(seg)) return buildVehicleDetail(contract, attrs);
  if (PROPERTY_SEGMENTS.has(seg)) return buildPropertyDetail(contract, attrs);
  if (LOAN_SEGMENTS.has(seg)) return buildLoanDetail(contract, attrs);
  return null;
}

// ---------------------------------------------------------------------------
// FV readiness builder
// ---------------------------------------------------------------------------

function buildFvReadiness(
  contract: RawContractInput,
  attrs: Record<string, unknown>,
): FvReadiness {
  return {
    resolvedFundId: safeString(attrs.resolvedFundId),
    resolvedFundCategory: (attrs.resolvedFundCategory as ResolvedFundCategory) ?? null,
    fvSourceType: (attrs.fvSourceType as FvSourceType) ?? null,
    investmentHorizon: safeString(attrs.investmentHorizon),
    monthlyAmount: safeNumber(contract.premiumAmount),
    targetAmount: safeNumber(attrs.targetAmount),
    expectedFutureValue: safeString(attrs.expectedFutureValue),
  };
}

// ---------------------------------------------------------------------------
// Main mapping function
// ---------------------------------------------------------------------------

/**
 * Map a raw contract row to a canonical product representation.
 * This is the SINGLE transformation all read consumers must use.
 */
export function mapContractToCanonicalProduct(
  contract: RawContractInput,
): CanonicalProduct {
  const attrs = (contract.portfolioAttributes ?? {}) as Record<string, unknown>;
  const displayProductName = resolveDisplayProductName(contract, attrs);

  return {
    id: contract.id,
    contactId: contract.contactId,
    segment: contract.segment,
    segmentLabel: SEGMENT_LABEL_MAP[contract.segment] ?? contract.segment,
    partnerName: contract.partnerName,
    productName: displayProductName,
    premiumMonthly: safeNumber(contract.premiumAmount),
    premiumAnnual: safeNumber(contract.premiumAnnual),
    contractNumber: contract.contractNumber,
    startDate: contract.startDate,
    anniversaryDate: contract.anniversaryDate,
    portfolioStatus: contract.portfolioStatus,
    sourceKind: contract.sourceKind,
    visibleToClient: contract.visibleToClient,
    segmentDetail: buildSegmentDetail(contract, attrs),
    fvReadiness: buildFvReadiness(contract, attrs),
  };
}

/**
 * Map an array of raw contract rows to canonical products.
 * Convenience wrapper for batch use.
 */
export function mapContractsToCanonicalProducts(
  contracts: RawContractInput[],
): CanonicalProduct[] {
  return contracts.map(mapContractToCanonicalProduct);
}

/**
 * Filter canonical products to only those with FV-computable data.
 * Useful for the FV layer in the next slice.
 */
export function filterFvEligibleProducts(
  products: CanonicalProduct[],
): CanonicalProduct[] {
  return products.filter(
    (p) =>
      p.fvReadiness.fvSourceType != null &&
      (p.fvReadiness.resolvedFundId != null || p.fvReadiness.resolvedFundCategory != null),
  );
}
