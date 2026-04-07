/**
 * Field quality gate — determines whether an extracted field should appear in the main
 * advisor/review panel, with review note, as diagnostic only, or be suppressed.
 *
 * Reuse-first: consumes evidenceTier + sourceKind from Fáze 5 evidence model.
 * No LLM, no I/O — pure function.
 */

import type { EvidenceTier, SourceKind } from "./document-review-types";

export type FieldDisplayLevel =
  | "displayable_high_confidence"   // Show in main advisor panel, no caveats
  | "displayable_with_review"       // Show but with "ověřte" note
  | "diagnostic_only"               // Show in diagnostic/debug section, not main panel
  | "suppress_from_main_view";       // Do not show at all (noise, conflict, irrelevant)

export type FieldQualityGateResult = {
  level: FieldDisplayLevel;
  reason?: string;
};

// ─── Family relevance maps ────────────────────────────────────────────────────

/** Fields that are NOT relevant for supporting/reference documents */
const PRODUCT_ONLY_FIELDS = new Set([
  "insurer", "lender", "productName", "productType", "contractNumber", "proposalNumber",
  "policyNumber", "policyStartDate", "policyEndDate", "policyDuration",
  "totalMonthlyPremium", "annualPremium", "riskPremium", "investmentPremium",
  "coverages", "insuredRisks", "insuredPersons", "beneficiaries",
  "installmentAmount", "monthlyInstallment", "installmentCount", "interestRate", "rpsn",
  "loanAmount", "totalFinancedAmount", "financedObject", "vin",
  "investmentStrategy", "investmentFunds", "isin", "fundAllocation",
  "policyholderName", "borrowerName", "coBorrowerName",
]);

/** Fields relevant for all families */
const UNIVERSAL_FIELDS = new Set([
  "fullName", "firstName", "lastName", "birthDate", "personalId", "address",
  "phone", "email", "occupation", "employer",
]);

/** Fields specific to supporting docs (payslip, tax, income) */
const SUPPORTING_DOC_FIELDS = new Set([
  "grossPay", "netPay", "payPeriod", "payoutAccount", "deductions", "taxableIncome",
  "companyName", "ico", "taxPeriodFrom", "taxPeriodTo", "taxType", "taxAmountDue",
  "taxableProfit", "filingType",
]);

/** Fields that should be suppressed for leasing docs (insurance-specific) */
const INSURANCE_ONLY_FIELDS = new Set([
  "insuredRisks", "coverages", "riskPremium", "investmentPremium", "beneficiaries",
  "medicalStatus", "healthStatus", "sectionSensitivity",
  "totalMonthlyPremium", "annualPremium",
]);

/** Fields that should be suppressed for insurance docs (leasing-specific) */
const LEASING_ONLY_FIELDS = new Set([
  "vin", "registrationPlate", "financedObject", "totalFinancedAmount",
  "firstInstallmentDate", "firstDrawdownDate", "ownResources", "downPayment",
  "representedBy", "customer", "customerCompany", "customerIco",
  "financingProvider", "leasingTenant", "lesseeName",
]);

/** Fields NOT relevant for investment docs */
const NON_INVESTMENT_FIELDS_IN_INVESTMENT = new Set([
  "insuredRisks", "coverages", "riskPremium", "beneficiaries", "medicalStatus",
  "totalMonthlyPremium", "annualPremium",
]);

// ─── Noise/garbage value detection ───────────────────────────────────────────

const GARBAGE_PATTERNS = [
  /^\[?N\/A\]?$/i,
  /^n\.?a\.?$/i,
  /^null$/i,
  /^undefined$/i,
  /^—+$/,
  /^\?+$/,
  /^x{3,}$/i,
  /^\.{3,}$/,
  /^#{2,}$/,
  /^0{3,}$/,
];

function isGarbageValue(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (s === "" || s === "—") return true;
  return GARBAGE_PATTERNS.some((p) => p.test(s));
}

// ─── Payment conflict detection ───────────────────────────────────────────────

export function detectPaymentFrequencyConflict(
  ef: Record<string, { value?: unknown; status?: string } | undefined>
): { hasConflict: boolean; reason?: string } {
  const freq = ef["paymentFrequency"]?.value;
  const monthly = ef["totalMonthlyPremium"]?.value ?? ef["monthlyInstallment"]?.value ?? ef["installmentAmount"]?.value;
  const annual = ef["annualPremium"]?.value;

  if (!freq || !monthly || !annual) return { hasConflict: false };

  const freqStr = String(freq).toLowerCase();
  const monthlyVal = parseFloat(String(monthly).replace(/[^0-9.,]/g, "").replace(",", "."));
  const annualVal = parseFloat(String(annual).replace(/[^0-9.,]/g, "").replace(",", "."));

  if (!isFinite(monthlyVal) || !isFinite(annualVal) || monthlyVal <= 0 || annualVal <= 0) {
    return { hasConflict: false };
  }

  // If frequency says "ročně" but annualPremium ≈ 12 * monthlyPremium → conflict
  if (freqStr.includes("ročn") || freqStr === "annually" || freqStr === "ročně") {
    if (Math.abs(annualVal - monthlyVal * 12) < monthlyVal * 0.5) {
      return { hasConflict: true, reason: "Roční pojistné odpovídá 12× měsíčnímu — možná záměna měsíční/roční frekvence." };
    }
  }

  // If frequency says "měsíčně" but monthlyPremium ≈ annualPremium → likely same amount, could be mislabeled
  if (freqStr.includes("měsíčn") || freqStr === "monthly" || freqStr === "měsíčně") {
    if (Math.abs(monthlyVal - annualVal) < annualVal * 0.05) {
      return { hasConflict: true, reason: "Měsíční a roční pojistné jsou shodné — ověřte frekvenci plateb v dokumentu." };
    }
  }

  return { hasConflict: false };
}

// ─── Contract number vs variableSymbol guard ─────────────────────────────────

export function detectContractVsVariableSymbolConflict(
  ef: Record<string, { value?: unknown; status?: string } | undefined>
): { hasConflict: boolean; reason?: string } {
  const contractNum = ef["contractNumber"]?.value;
  const variableSymbol = ef["variableSymbol"]?.value;
  const proposalNum = ef["proposalNumber"]?.value;

  if (!contractNum || !variableSymbol) return { hasConflict: false };

  const cn = String(contractNum).trim();
  const vs = String(variableSymbol).trim();

  // If contractNumber and variableSymbol are identical, one of them is likely wrong
  if (cn === vs) {
    return {
      hasConflict: true,
      reason: "Číslo smlouvy a variabilní symbol jsou shodné — variabilní symbol může být špatně použit jako číslo smlouvy.",
    };
  }

  // If proposalNumber matches contractNumber, prefer contractNumber (already OK, no conflict)
  if (proposalNum && String(proposalNum).trim() === cn) {
    return { hasConflict: false };
  }

  return { hasConflict: false };
}

// ─── Name deduplication guard ─────────────────────────────────────────────────

export function isNameFieldRedundant(
  key: string,
  ef: Record<string, { value?: unknown; status?: string; evidenceTier?: EvidenceTier } | undefined>
): boolean {
  if (key !== "firstName" && key !== "lastName") return false;

  const fullName = ef["fullName"];
  if (!fullName?.value) return false;

  const fullVal = String(fullName.value).trim();
  const val = String(ef[key]?.value ?? "").trim();
  if (!val) return false;

  // If the fullName already contains this value and the split was inferred (not explicit LLM output),
  // the split is redundant
  const tier = ef[key]?.evidenceTier;
  const isInferred = tier === "local_inference" || tier === "model_inference_only";

  if (isInferred && fullVal.toLowerCase().includes(val.toLowerCase())) return true;

  return false;
}

// ─── Main quality gate function ───────────────────────────────────────────────

export type QualityGateContext = {
  /** Product family from classifier: leasing / life_insurance / investment / supporting / ... */
  productFamily?: string;
  /** Output mode from pipeline: reference_or_supporting_document / structured_product_document / ... */
  outputMode?: string;
  /** Primary document type */
  primaryType?: string;
  evidenceTier?: EvidenceTier;
  sourceKind?: SourceKind;
  extractionStatus?: string;
  confidence?: number;
};

export function fieldQualityGate(
  fieldKey: string,
  value: unknown,
  ctx: QualityGateContext
): FieldQualityGateResult {
  const family = (ctx.productFamily ?? "").toLowerCase();
  const outputMode = ctx.outputMode ?? "";
  const isSupporting = outputMode === "reference_or_supporting_document" ||
    family === "supporting" || family === "compliance";
  const isLeasing = family === "leasing" || family === "financing" || family === "financial_leasing" || family === "fleet_financing";
  const isInsurance = family === "life_insurance" || family === "non_life_insurance" || family.includes("insurance");
  const isInvestment = family === "investment" || family === "dip" || family === "dps" || family === "pp";

  // 1. Garbage values → suppress always
  if (isGarbageValue(value)) {
    return { level: "suppress_from_main_view", reason: "garbage_value" };
  }

  // 2. Supporting docs — suppress product-only fields entirely
  if (isSupporting && PRODUCT_ONLY_FIELDS.has(fieldKey)) {
    return { level: "suppress_from_main_view", reason: "not_relevant_for_supporting_doc" };
  }

  // 3. Leasing docs — suppress insurance-only fields
  if (isLeasing && INSURANCE_ONLY_FIELDS.has(fieldKey)) {
    return { level: "suppress_from_main_view", reason: "insurance_field_not_relevant_for_leasing" };
  }

  // 4. Insurance docs — suppress leasing-specific fields
  if (isInsurance && LEASING_ONLY_FIELDS.has(fieldKey)) {
    return { level: "suppress_from_main_view", reason: "leasing_field_not_relevant_for_insurance" };
  }

  // 5. Investment docs — suppress insurance-only fields
  if (isInvestment && NON_INVESTMENT_FIELDS_IN_INVESTMENT.has(fieldKey)) {
    return { level: "suppress_from_main_view", reason: "insurance_field_not_relevant_for_investment" };
  }

  // 6. Missing / not-applicable status → suppress
  if (
    ctx.extractionStatus === "missing" ||
    ctx.extractionStatus === "not_found" ||
    ctx.extractionStatus === "not_applicable"
  ) {
    return { level: "suppress_from_main_view", reason: "status_missing" };
  }

  // 7. Source kind violation (institution value in client field) → already cleared by source priority,
  //    but if it survived, suppress
  if (ctx.sourceKind === "insurer_header" || ctx.sourceKind === "signature_block") {
    if (isClientIdentityField(fieldKey)) {
      return { level: "suppress_from_main_view", reason: "source_priority_violation" };
    }
  }

  // 8. Evidence tier rules
  const tier = ctx.evidenceTier;

  if (tier === "missing") {
    return { level: "suppress_from_main_view", reason: "status_missing" };
  }

  // Legacy/no-tier: fall through to default displayable_with_review (don't suppress unknown data)
  if (!tier) {
    return { level: "displayable_with_review", reason: "no_evidence_tier" };
  }

  if (tier === "explicit_labeled_field" || tier === "explicit_table_field" || tier === "explicit_section_block") {
    return { level: "displayable_high_confidence" };
  }

  if (tier === "normalized_alias_match") {
    // Good confidence alias — show, no caveat if confidence is decent
    if (typeof ctx.confidence === "number" && ctx.confidence >= 0.70) {
      return { level: "displayable_high_confidence" };
    }
    return { level: "displayable_with_review", reason: "alias_match_needs_verification" };
  }

  if (tier === "local_inference" || tier === "cross_section_inference") {
    return { level: "displayable_with_review", reason: "inferred_from_context" };
  }

  if (tier === "classifier_fallback") {
    return { level: "diagnostic_only", reason: "classifier_fallback" };
  }

  if (tier === "model_inference_only") {
    // model-only guess — show with review unless confidence is very high
    if (typeof ctx.confidence === "number" && ctx.confidence >= 0.85) {
      return { level: "displayable_with_review", reason: "model_inferred_high_conf" };
    }
    return { level: "diagnostic_only", reason: "model_inference_only" };
  }

  // Default: show with review
  return { level: "displayable_with_review", reason: "default_uncertain" };
}

function isClientIdentityField(key: string): boolean {
  return new Set([
    "fullName", "firstName", "lastName", "birthDate", "personalId",
    "address", "phone", "email", "occupation",
    "clientFullName", "borrowerName", "investorFullName", "policyholderName", "customerName",
  ]).has(key);
}

// ─── Suppress irrelevant groups from the advisor panel ───────────────────────

/** Groups that should be hidden for supporting/reference documents */
export const SUPPRESS_GROUPS_FOR_SUPPORTING = new Set([
  "contract", "contractCore", "coverage", "risks", "investments",
  "product", "paymentsCore",
]);

/** Groups that should be hidden for leasing documents */
export const SUPPRESS_GROUPS_FOR_LEASING = new Set(["coverage", "risks", "investments"]);

/** Groups that should be hidden for investment documents when no investment data */
export const SUPPRESS_GROUPS_FOR_INVESTMENT_IF_EMPTY = new Set(["coverage", "risks"]);

export function shouldSuppressGroup(
  groupId: string,
  outputMode: string,
  productFamily: string,
): boolean {
  const isSupporting = outputMode === "reference_or_supporting_document";
  const isLeasing = ["leasing", "financing", "financial_leasing", "fleet_financing"].includes(productFamily?.toLowerCase());

  if (isSupporting && SUPPRESS_GROUPS_FOR_SUPPORTING.has(groupId)) return true;
  if (isLeasing && SUPPRESS_GROUPS_FOR_LEASING.has(groupId)) return true;
  return false;
}
