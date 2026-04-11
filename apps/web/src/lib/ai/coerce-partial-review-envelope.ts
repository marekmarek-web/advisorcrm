/**
 * Best-effort coercion when LLM JSON fails strict Zod validation.
 * Fills missing extractedField.status, fixes enums, clamps numbers — then re-validates.
 */

import type { ClassificationResult } from "./document-classification";
import type { ContractDocumentType } from "./document-classification";
import type { DocumentReviewEnvelope } from "./document-review-types";
import {
  documentReviewEnvelopeSchema,
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  EXTRACTION_FIELD_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
} from "./document-review-types";

const PRIMARY_SET = new Set<string>(PRIMARY_DOCUMENT_TYPES);
const LIFECYCLE_SET = new Set<string>(DOCUMENT_LIFECYCLE_STATUSES);
const INTENT_SET = new Set<string>(DOCUMENT_INTENTS);
const FIELD_STATUS_SET = new Set<string>(EXTRACTION_FIELD_STATUSES);
const RESERVED_ENVELOPE_KEYS = new Set<string>([
  "documentClassification",
  "documentMeta",
  "parties",
  "productsOrObligations",
  "financialTerms",
  "serviceTerms",
  "extractedFields",
  "evidence",
  "candidateMatches",
  "sectionSensitivity",
  "relationshipInference",
  "reviewWarnings",
  "suggestedActions",
  "sensitivityProfile",
  "contentFlags",
  "debug",
  "dataCompleteness",
]);
const NON_FIELD_TOP_LEVEL_KEYS = new Set<string>([
  "confidence",
  "reasoning",
  "summary",
  "notes",
  "missingFields",
  "fieldConfidenceMap",
  "classificationReasons",
  "reasonsForReview",
  "processingStatus",
  "processingStage",
  // Classifier output fields that must never become extractedFields
  "documentType",
  "documentTypeLabel",
  "normalizedDocumentType",
  "productFamily",
  "productFamilyLabel",
  "productSubtype",
  "productSubtypeLabel",
  "businessIntent",
  "businessIntentLabel",
  "recommendedRoute",
  "supportedForDirectExtraction",
  "documentTypeUncertain",
  "warnings",
  "reasons",
  "rawClassification",
  // Envelope sub-object keys that may leak to top-level
  "primaryType",
  "lifecycleStatus",
  "documentIntent",
  "subtype",
  "type",
  "route",
  "pipelineRoute",
  "extractionRoute",
  "scannedVsDigital",
  "overallConfidence",
  "textCoverageEstimate",
  "pageCount",
  "preprocessStatus",
  "preprocessMode",
]);

export function parseJsonObjectFromAiReviewRaw(raw: string): Record<string, unknown> | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(jsonStr) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function clamp01(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeConfidence01(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
}

/** Set during partial-coercion entry points so wrapped cells inherit discounted document confidence. */
let docClassificationConfidenceForPartialCoerce: number | undefined;

function discountedFieldConfidenceFromDoc(raw: unknown): number {
  const d = normalizeConfidence01(raw, 0.5);
  return Math.min(1, Math.max(0.45, d * 0.8));
}

function normalizeExtractedFieldCell(key: string, v: unknown): Record<string, unknown> {
  const defaultConf =
    docClassificationConfidenceForPartialCoerce !== undefined
      ? discountedFieldConfidenceFromDoc(docClassificationConfidenceForPartialCoerce)
      : 0.45;
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    const o = { ...(v as Record<string, unknown>) };
    const st = o.status;
    if (typeof st !== "string" || !FIELD_STATUS_SET.has(st)) {
      o.status = "inferred_low_confidence";
    }
    if (o.confidence != null) {
      o.confidence = normalizeConfidence01(o.confidence, 0.5);
    } else {
      o.confidence = defaultConf;
    }
    return o;
  }
  return {
    value: v,
    status: "inferred_low_confidence",
    confidence: defaultConf,
  };
}

function coerceExtractedFields(raw: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (key.startsWith("_")) continue;
    out[key] = normalizeExtractedFieldCell(key, val);
  }
  return out;
}

function looksLikeFieldValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (typeof val === "number") return true;
  if (typeof val === "boolean") return false;
  if (Array.isArray(val)) return false;
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    return "value" in o || "status" in o;
  }
  return false;
}

function collectTopLevelFieldCandidates(parsed: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (key.startsWith("_") || RESERVED_ENVELOPE_KEYS.has(key) || NON_FIELD_TOP_LEVEL_KEYS.has(key)) continue;
    if (!looksLikeFieldValue(val)) continue;
    out[key] = normalizeExtractedFieldCell(key, val);
  }
  return out;
}

function coerceDocumentMeta(dm: unknown): Record<string, unknown> {
  const base =
    dm && typeof dm === "object" && !Array.isArray(dm) ? { ...(dm as Record<string, unknown>) } : {};
  const svd = base.scannedVsDigital;
  if (svd !== "scanned" && svd !== "digital" && svd !== "unknown") {
    base.scannedVsDigital = "unknown";
  }
  if (base.pageCount != null) {
    const p = base.pageCount;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1) {
      delete base.pageCount;
    }
  }
  if (base.overallConfidence != null) {
    base.overallConfidence = clamp01(base.overallConfidence, 0.5);
  }
  if (base.textCoverageEstimate != null) {
    base.textCoverageEstimate = clamp01(base.textCoverageEstimate, 0);
  }
  return base;
}

function coerceDocumentClassification(
  raw: unknown,
  forcedPrimaryType: ContractDocumentType,
  classification: ClassificationResult
): Record<string, unknown> {
  const dc =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  const pt = dc.primaryType;
  dc.primaryType = typeof pt === "string" && PRIMARY_SET.has(pt) ? pt : forcedPrimaryType;
  const ls = dc.lifecycleStatus;
  dc.lifecycleStatus =
    typeof ls === "string" && LIFECYCLE_SET.has(ls) ? ls : classification.lifecycleStatus;
  const di = dc.documentIntent;
  dc.documentIntent =
    typeof di === "string" && INTENT_SET.has(di) ? di : classification.documentIntent ?? "reference_only";
  dc.confidence = clamp01(dc.confidence, classification.confidence);
  if (!Array.isArray(dc.reasons)) {
    dc.reasons = Array.isArray(classification.reasons) ? [...classification.reasons] : [];
  } else {
    dc.reasons = dc.reasons.map((r) => String(r)).slice(0, 24);
  }
  if (dc.subtype != null && typeof dc.subtype !== "string") {
    dc.subtype = String(dc.subtype).slice(0, 120);
  }
  return dc;
}

function coerceEvidence(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const e = { ...(item as Record<string, unknown>) };
      if (typeof e.fieldKey !== "string" || !e.fieldKey.trim()) {
        e.fieldKey = `field_${i}`;
      }
      const st = e.status;
      e.status = typeof st === "string" && FIELD_STATUS_SET.has(st) ? st : "extracted";
      return e;
    })
    .filter((x): x is Record<string, unknown> => x != null);
}

function coerceReviewWarnings(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      if (!w || typeof w !== "object" || Array.isArray(w)) return null;
      const o = w as Record<string, unknown>;
      const code = typeof o.code === "string" ? o.code : "coerced_warning";
      const message = typeof o.message === "string" ? o.message : String(o.message ?? "");
      if (!message.trim()) return null;
      const sev = o.severity;
      const severity =
        sev === "info" || sev === "warning" || sev === "critical" ? sev : "warning";
      return { code, message, field: o.field, severity };
    })
    .filter(Boolean);
}

function coerceSuggestedActions(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) return null;
      const o = a as Record<string, unknown>;
      const type = typeof o.type === "string" && o.type.trim() ? o.type : "workflow_suggestion";
      const label = typeof o.label === "string" && o.label.trim() ? o.label : "Návrh kroku";
      const payload =
        o.payload && typeof o.payload === "object" && !Array.isArray(o.payload)
          ? o.payload
          : {};
      return { type, label, payload };
    })
    .filter(Boolean);
}

/**
 * For loan/mortgage stored-prompt responses that return a nested legacy format:
 * { client: {fullName,...}, loanDetails: {loanAmount,...}, paymentDetails: {...} }
 * Flattens these into the standard flat extractedFields map.
 */
function flattenLegacyLoanNestedFields(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  const LOAN_NESTED_BLOCKS: Record<string, string[]> = {
    // nested block key → canonical extractedField keys to lift up
    client: ["fullName", "birthDate", "personalId", "address", "phone", "email", "occupation",
             "firstName", "lastName", "clientFullName", "borrowerName", "dluznik"],
    loanDetails: [
      "loanAmount", "installmentAmount", "installmentCount", "repaymentPeriod", "interestRate",
      "rpsn", "totalRepaymentAmount", "firstRepaymentDate", "disbursementDate", "contractDate",
      "startDate", "maturityDate", "purpose", "monthlyInstalment", "monthlyInstallment",
      "vyseUveru", "pocetSplatek", "mesicniSplatka",
    ],
    paymentDetails: [
      "bankAccount", "variableSymbol", "specificSymbol", "constantSymbol", "iban", "bankCode",
      "accountForRepayment", "repaymentAccount", "firstRepaymentDate",
    ],
    coApplicant: ["coBorrowerName", "spoludluznik", "coApplicantFullName", "coApplicant"],
    intermediary: ["intermediaryName", "intermediaryCompany", "intermediaryCode", "zprostredkovatel"],
    intermediaryDetails: ["intermediaryName", "intermediaryCompany", "intermediaryCode"],
    lender: [], // handled separately
  };

  for (const [blockKey, fieldKeys] of Object.entries(LOAN_NESTED_BLOCKS)) {
    const block = parsed[blockKey];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const blockObj = block as Record<string, unknown>;

    for (const fk of fieldKeys) {
      if (ef[fk]) continue; // don't overwrite already-present fields
      const val = blockObj[fk];
      if (val == null || (typeof val === "string" && !val.trim())) continue;
      ef[fk] = normalizeExtractedFieldCell(fk, val);
    }
    // Also lift any remaining fields from the block that look scalar / useful
    for (const [k, v] of Object.entries(blockObj)) {
      if (k.startsWith("_") || ef[k]) continue;
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      if (typeof v === "object" && !Array.isArray(v)) continue; // skip deeply nested
      ef[k] = normalizeExtractedFieldCell(k, v);
    }
  }

  // Handle lender as a top-level string or nested object
  const lenderRaw = parsed.lender ?? parsed.veritel ?? parsed.bankName;
  if (lenderRaw && !ef.lender) {
    if (typeof lenderRaw === "string" && lenderRaw.trim()) {
      ef.lender = normalizeExtractedFieldCell("lender", lenderRaw);
    } else if (typeof lenderRaw === "object" && !Array.isArray(lenderRaw)) {
      const ln = (lenderRaw as Record<string, unknown>);
      const name = ln.name ?? ln.value ?? ln.lenderName;
      if (typeof name === "string" && name.trim()) {
        ef.lender = normalizeExtractedFieldCell("lender", name);
      }
    }
  }
}

/**
 * Stored Prompt Builder / older DIP extraction JSON often returns a flat "insurance-shaped"
 * object (document_meta, client, payments, investment) instead of DocumentReviewEnvelope.
 * Lift those into canonical extractedFields so Zod + verification can succeed.
 */
function liftLegacyDipStoredPromptBlocks(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  const dmRaw = parsed.document_meta ?? parsed.documentMeta;
  if (dmRaw && typeof dmRaw === "object" && !Array.isArray(dmRaw)) {
    const dm = dmRaw as Record<string, unknown>;
    const pairs: [string, string][] = [
      ["insurer", "institutionName"],
      ["product_name", "productName"],
      ["contract_number", "contractNumber"],
      ["proposal_number", "proposalNumber"],
      ["policy_start_date", "policyStartDate"],
      ["policy_end_date", "policyEndDate"],
    ];
    for (const [src, dest] of pairs) {
      if (ef[dest]) continue;
      const v = dm[src];
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      ef[dest] = normalizeExtractedFieldCell(dest, v);
    }
  }

  const payRaw = parsed.payments ?? parsed.paymentDetails;
  if (payRaw && typeof payRaw === "object" && !Array.isArray(payRaw)) {
    const pay = payRaw as Record<string, unknown>;
    const payPairs: [string, string][] = [
      ["bank_account", "bankAccount"],
      ["variable_symbol", "variableSymbol"],
      ["specific_symbol", "specificSymbol"],
      ["constant_symbol", "constantSymbol"],
      ["iban", "iban"],
      ["bank_code", "bankCode"],
    ];
    for (const [src, dest] of payPairs) {
      if (ef[dest]) continue;
      const v = pay[src];
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      ef[dest] = normalizeExtractedFieldCell(dest, v);
    }
  }

  const invRaw = parsed.investment;
  if (invRaw && typeof invRaw === "object" && !Array.isArray(invRaw)) {
    const inv = invRaw as Record<string, unknown>;
    if (!ef.investmentStrategy && inv.investment_strategy != null) {
      const v = inv.investment_strategy;
      if (typeof v === "string" && v.trim()) {
        ef.investmentStrategy = normalizeExtractedFieldCell("investmentStrategy", v);
      }
    }
    if (!ef.intendedInvestment && inv.total_investment_amount != null) {
      const v = inv.total_investment_amount;
      if (v != null && String(v).trim()) {
        ef.intendedInvestment = normalizeExtractedFieldCell("intendedInvestment", v);
      }
    }
  }

  const prodRaw = parsed.product;
  if (prodRaw && typeof prodRaw === "object" && !Array.isArray(prodRaw)) {
    const prod = prodRaw as Record<string, unknown>;
    if (!ef.currency && prod.currency != null) {
      const v = prod.currency;
      if (typeof v === "string" && v.trim()) {
        ef.currency = normalizeExtractedFieldCell("currency", v);
      }
    }
    if (!ef.paymentFrequency && prod.payment_frequency != null) {
      const v = prod.payment_frequency;
      if (typeof v === "string" && v.trim()) {
        ef.paymentFrequency = normalizeExtractedFieldCell("paymentFrequency", v);
      }
    }
  }

  const clientRaw = parsed.client;
  if (clientRaw && typeof clientRaw === "object" && !Array.isArray(clientRaw)) {
    const c = clientRaw as Record<string, unknown>;
    if (!ef.investorFullName) {
      const name =
        (typeof c.full_name === "string" && c.full_name.trim() ? c.full_name : null) ??
        (typeof c.fullName === "string" && c.fullName.trim() ? c.fullName : null);
      if (name) {
        ef.investorFullName = normalizeExtractedFieldCell("investorFullName", name);
      }
    }
  }
}

function inferProductTypeForInvestmentSubscription(
  ef: Record<string, Record<string, unknown>>,
): void {
  if (ef.productType) {
    const v = ef.productType.value;
    if (v != null && String(v).trim() && String(v) !== "null") return;
  }
  const productName = String(ef.productName?.value ?? "").toLowerCase();
  const strategy = String(ef.investmentStrategy?.value ?? "").trim();
  if (productName.includes("dip") || productName.includes("dlouhodobý investiční") || productName.includes("amundi platforma")) {
    ef.productType = normalizeExtractedFieldCell("productType", "DIP");
    return;
  }
  if (strategy) {
    const label = strategy.length > 80 ? `${strategy.slice(0, 77)}…` : strategy;
    ef.productType = normalizeExtractedFieldCell("productType", label);
    return;
  }
  if (productName) {
    ef.productType = normalizeExtractedFieldCell("productType", "investment_subscription");
  }
}

/**
 * For investment/subscription stored-prompt responses that return nested legacy format:
 * { investor: {fullName,...}, fund: {isin,...}, payment: {bankAccount,...} }
 */
function flattenLegacyInvestmentNestedFields(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  liftLegacyDipStoredPromptBlocks(parsed, ef);

  const INVESTMENT_NESTED_BLOCKS: Record<string, string[]> = {
    investor: ["fullName", "birthDate", "personalId", "address", "phone", "email",
               "investorFullName", "investorName", "klient"],
    client: ["fullName", "birthDate", "personalId", "address", "phone", "email",
             "investorFullName", "clientFullName"],
    fund: ["isin", "productName", "fundName", "name", "isinCode", "allocation"],
    payment: ["bankAccount", "variableSymbol", "specificSymbol", "iban", "bankCode",
              "amountToPay", "castkaKUhrade", "intendedInvestment"],
    subscription: ["isin", "productName", "intendedInvestment", "entryFeePercent", "amountToPay"],
    intermediary: ["intermediaryName", "intermediaryCompany", "intermediaryCode", "zprostredkovatel"],
    institution: [], // handled separately
  };

  for (const [blockKey, fieldKeys] of Object.entries(INVESTMENT_NESTED_BLOCKS)) {
    const block = parsed[blockKey];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const blockObj = block as Record<string, unknown>;

    for (const fk of fieldKeys) {
      if (ef[fk]) continue;
      const val = blockObj[fk];
      if (val == null || (typeof val === "string" && !val.trim())) continue;
      ef[fk] = normalizeExtractedFieldCell(fk, val);
    }
    // Lift remaining scalar fields
    for (const [k, v] of Object.entries(blockObj)) {
      if (k.startsWith("_") || ef[k]) continue;
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      if (typeof v === "object" && !Array.isArray(v)) continue;
      ef[k] = normalizeExtractedFieldCell(k, v);
    }
  }

  // Handle top-level provider/institution
  const providerRaw = parsed.provider ?? parsed.institutionName ?? parsed.institution;
  if (providerRaw && !ef.institutionName && !ef.provider) {
    if (typeof providerRaw === "string" && providerRaw.trim()) {
      ef.institutionName = normalizeExtractedFieldCell("institutionName", providerRaw);
    }
  }

  inferProductTypeForInvestmentSubscription(ef);
}

/**
 * For leasing/financing stored-prompt responses that return nested legacy format:
 * { customer: {...}, financedObject: {...}, financingTerms: {...} }
 */
function flattenLegacyLeasingNestedFields(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  const LEASING_NESTED_BLOCKS: Record<string, string[]> = {
    customer: ["fullName", "customerName", "zakaznik", "companyName", "ico", "representedBy",
               "customerFullName", "customerIco"],
    lessee: ["fullName", "customerName", "zakaznik", "companyName", "ico", "representedBy"],
    financingTerms: ["totalFinancedAmount", "installmentAmount", "installmentCount", "duration",
                     "firstInstallmentDate", "startDate", "maturityDate", "downPayment",
                     "interestRate", "paymentFrequency", "firstDrawdownDate"],
    leasingTerms: ["totalFinancedAmount", "installmentAmount", "installmentCount", "duration",
                   "firstInstallmentDate", "startDate", "maturityDate", "downPayment",
                   "paymentFrequency"],
    vehicleDetails: ["financedObject", "vin", "serialNumber", "brandModel", "vehicleType",
                     "registrationPlate", "vehicleDescription"],
    objectDetails: ["financedObject", "vin", "serialNumber", "equipmentDescription"],
    intermediary: ["intermediaryName", "intermediaryCompany", "zprostredkovatel"],
  };

  for (const [blockKey, fieldKeys] of Object.entries(LEASING_NESTED_BLOCKS)) {
    const block = parsed[blockKey];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const blockObj = block as Record<string, unknown>;

    for (const fk of fieldKeys) {
      if (ef[fk]) continue;
      const val = blockObj[fk];
      if (val == null || (typeof val === "string" && !val.trim())) continue;
      ef[fk] = normalizeExtractedFieldCell(fk, val);
    }
    for (const [k, v] of Object.entries(blockObj)) {
      if (k.startsWith("_") || ef[k]) continue;
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      if (typeof v === "object" && !Array.isArray(v)) continue;
      ef[k] = normalizeExtractedFieldCell(k, v);
    }
  }

  // Handle lender
  const lenderRaw = parsed.lender ?? parsed.financingProvider ?? parsed.pronajimatel ?? parsed.leasingCompany;
  if (lenderRaw && !ef.lender) {
    if (typeof lenderRaw === "string" && lenderRaw.trim()) {
      ef.lender = normalizeExtractedFieldCell("lender", lenderRaw);
    } else if (typeof lenderRaw === "object" && !Array.isArray(lenderRaw)) {
      const ln = lenderRaw as Record<string, unknown>;
      const name = ln.name ?? ln.value ?? ln.companyName;
      if (typeof name === "string" && name.trim()) {
        ef.lender = normalizeExtractedFieldCell("lender", name);
      }
    }
  }
}

const LOAN_MORTGAGE_PRIMARY_TYPES = new Set<string>([
  "mortgage_document",
  "consumer_loan_contract",
  "consumer_loan_with_payment_protection",
]);

const NONLIFE_PRIMARY_TYPES = new Set<string>([
  "nonlife_insurance_contract",
  "liability_insurance_offer",
  "precontract_information",
]);

/** Amendment/change/service docs and proposal docs — all nested formats that can have insurer/client/ref */
const AMENDMENT_PROPOSAL_PRIMARY_TYPES = new Set<string>([
  "insurance_policy_change_or_service_doc",
  "life_insurance_modelation",
  "life_insurance_investment_contract",
  "life_insurance_contract",
  "life_insurance_proposal",
  "nonlife_insurance_contract",
  "liability_insurance_offer",
  "precontract_information",
]);

/** Supporting documents: payslip, tax return, bank statement */
const SUPPORTING_DOC_PRIMARY_TYPES = new Set<string>([
  "payslip_document",
  "corporate_tax_return",
  "bank_statement",
]);

/**
 * Flatten amendment/change/service/proposal responses that may use varied key names.
 * Ensures insurer/provider, client fullName, contract/policy reference, and payment fields
 * propagate into extractedFields regardless of how the LLM named them.
 */
function flattenAmendmentProposalFields(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  // Insurer / provider aliases (many stored prompts use different keys)
  const insurerAliases = [
    "insurer", "institutionName", "provider", "pojistovna", "pojistitel",
    "insurance_company", "insuranceCompany", "company", "contractingParty",
  ];
  if (!ef.insurer && !ef.institutionName && !ef.provider) {
    for (const alias of insurerAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.insurer = normalizeExtractedFieldCell("insurer", v);
        break;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = (v as Record<string, unknown>).value ?? (v as Record<string, unknown>).name;
        if (typeof inner === "string" && inner.trim()) {
          ef.insurer = normalizeExtractedFieldCell("insurer", inner);
          break;
        }
      }
    }
  }

  // Client fullName aliases
  const clientAliases = [
    "fullName", "clientFullName", "clientName", "client_full_name",
    "pojistník", "jméno", "name", "jmeno", "policyholder",
  ];
  if (!ef.fullName && !ef.clientFullName) {
    for (const alias of clientAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.fullName = normalizeExtractedFieldCell("fullName", v);
        break;
      }
    }
    // Also check nested client block
    const clientBlock = parsed.client ?? parsed.pojistnik;
    if (!ef.fullName && !ef.clientFullName && clientBlock && typeof clientBlock === "object" && !Array.isArray(clientBlock)) {
      const cb = clientBlock as Record<string, unknown>;
      const name = cb.fullName ?? cb.full_name ?? cb.name ?? cb.jmeno;
      if (typeof name === "string" && name.trim()) {
        ef.fullName = normalizeExtractedFieldCell("fullName", name);
      }
    }
  }

  // Contract/policy/proposal reference aliases
  const contractAliases = [
    "contractNumber", "contract_number", "policyNumber", "policy_number",
    "proposalNumber", "proposal_number", "cisloSmlouvy", "cisloPojistky",
    "existingPolicyNumber", "existingContractNumber", "existingContract",
    "referenceNumber", "cisloNavrhu",
  ];
  if (!ef.contractNumber && !ef.proposalNumber && !ef.existingPolicyNumber) {
    for (const alias of contractAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.contractNumber = normalizeExtractedFieldCell("contractNumber", v);
        break;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = (v as Record<string, unknown>).value;
        if (typeof inner === "string" && inner.trim()) {
          ef.contractNumber = normalizeExtractedFieldCell("contractNumber", inner);
          break;
        }
      }
    }
  }

  // Payment / premium amount aliases
  const paymentAliases = [
    "totalMonthlyPremium", "total_monthly_premium", "monthlyPremium",
    "annualPremium", "annual_premium", "premiumAmount", "premium_amount",
    "mesicniPojistne", "pojistne", "castka",
  ];
  if (!ef.totalMonthlyPremium && !ef.annualPremium && !ef.premiumAmount) {
    for (const alias of paymentAliases) {
      const v = parsed[alias];
      if (v != null && String(v).trim() && String(v) !== "null") {
        ef.totalMonthlyPremium = normalizeExtractedFieldCell("totalMonthlyPremium", v);
        break;
      }
    }
  }

  // productName aliases
  const productAliases = [
    "productName", "product_name", "nazevProduktu", "pojisteniNazev",
    "insuranceName", "insuranceType", "changeType", "serviceType",
  ];
  if (!ef.productName) {
    for (const alias of productAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.productName = normalizeExtractedFieldCell("productName", v);
        break;
      }
    }
  }
}

/**
 * Flatten supporting doc responses (payslip, tax return, bank statement).
 * These docs MUST return a best-effort summary with at least employer/employee name,
 * income fields, or tax period — never empty.
 */
function flattenSupportingDocFields(
  parsed: Record<string, unknown>,
  ef: Record<string, Record<string, unknown>>,
): void {
  // Payslip specific
  const employerAliases = ["employer", "employerName", "zamestnavatel", "company", "companyName", "employer_name"];
  if (!ef.employer) {
    for (const alias of employerAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.employer = normalizeExtractedFieldCell("employer", v);
        break;
      }
    }
  }
  const employeeAliases = ["employee", "employeeName", "zamestnanec", "fullName", "workerName", "employee_name"];
  if (!ef.employee && !ef.fullName) {
    for (const alias of employeeAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.employee = normalizeExtractedFieldCell("employee", v);
        break;
      }
    }
  }
  const grossAliases = ["grossIncome", "grossWage", "grossPay", "hrubazmda", "hrubaMzda", "gross_income", "gross_pay"];
  if (!ef.grossIncome && !ef.grossWage) {
    for (const alias of grossAliases) {
      const v = parsed[alias];
      if (v != null && String(v).trim() && String(v) !== "null") {
        ef.grossIncome = normalizeExtractedFieldCell("grossIncome", v);
        break;
      }
    }
  }
  const netAliases = ["netIncome", "netWage", "netPay", "cistaMzda", "cistamzda", "net_income", "net_pay"];
  if (!ef.netIncome && !ef.netWage) {
    for (const alias of netAliases) {
      const v = parsed[alias];
      if (v != null && String(v).trim() && String(v) !== "null") {
        ef.netIncome = normalizeExtractedFieldCell("netIncome", v);
        break;
      }
    }
  }

  // Tax return specific
  const taxPeriodAliases = ["taxPeriod", "tax_period", "zdanovacíObdobí", "zdaňovacíObdobí", "obdobi", "taxYear", "year"];
  if (!ef.taxPeriod && !ef.taxYear) {
    for (const alias of taxPeriodAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.taxPeriod = normalizeExtractedFieldCell("taxPeriod", v);
        break;
      }
    }
  }
  const taxPayerAliases = ["taxpayerName", "companyName", "nazevFirmy", "jmeno", "fullName", "taxpayer_name"];
  if (!ef.taxpayerName && !ef.fullName) {
    for (const alias of taxPayerAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.taxpayerName = normalizeExtractedFieldCell("taxpayerName", v);
        break;
      }
    }
  }

  // Supporting doc summary — if LLM returned a summary field, always preserve it
  const summaryAliases = ["summary", "documentSummary", "shrnutí", "popis", "description"];
  if (!ef.documentSummary && !ef.summary) {
    for (const alias of summaryAliases) {
      const v = parsed[alias];
      if (typeof v === "string" && v.trim()) {
        ef.documentSummary = normalizeExtractedFieldCell("documentSummary", v);
        break;
      }
    }
  }
}

/**
 * Infer insuredObject for non-life insurance documents when model omitted it.
 * GČP odpovědnost case: if product/text clearly mentions liability/odpovědnost, infer from productName.
 */
function inferInsuredObjectForNonlife(
  ef: Record<string, Record<string, unknown>>,
): void {
  if (ef.insuredObject) {
    const v = ef.insuredObject.value;
    if (v != null && String(v).trim() && String(v) !== "null") return;
  }
  // Try inferring from productName or coverageSummary
  const productName = String(ef.productName?.value ?? ef.institutionName?.value ?? "").toLowerCase();
  const coverageSummary = String(ef.coverageSummary?.value ?? "").toLowerCase();
  const combined = productName + " " + coverageSummary;

  if (/odpověd|odpoved|liability|responsibility|pojištění odpověd/i.test(combined)) {
    const label = productName
      ? `Odpovědnost z činnosti (odvozeno z: ${String(ef.productName?.value ?? "").slice(0, 60)})`
      : "Odpovědnost (inferred from product classification)";
    ef.insuredObject = {
      ...normalizeExtractedFieldCell("insuredObject", label),
      status: "inferred_low_confidence",
      confidence: 0.55,
    };
  }
}

/**
 * Mutates a shallow-cloned envelope-shaped object, then runs `documentReviewEnvelopeSchema.safeParse`.
 */
export function tryCoerceReviewEnvelopeAfterValidationFailure(
  parsed: Record<string, unknown>,
  forcedPrimaryType: ContractDocumentType,
  classification: ClassificationResult
): DocumentReviewEnvelope | null {
  let draft: Record<string, unknown>;
  try {
    draft = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  } catch {
    return null;
  }

  draft.documentClassification = coerceDocumentClassification(
    draft.documentClassification,
    forcedPrimaryType,
    classification
  );

  const prevDocConf = docClassificationConfidenceForPartialCoerce;
  const dcRaw = draft.documentClassification as Record<string, unknown>;
  const dcConf = dcRaw?.confidence;
  docClassificationConfidenceForPartialCoerce =
    typeof dcConf === "number" && Number.isFinite(dcConf) ? dcConf : undefined;
  try {
    draft.documentMeta = coerceDocumentMeta(draft.documentMeta);
    const topLevelCandidates = collectTopLevelFieldCandidates(draft);
    const baseEf = coerceExtractedFields(draft.extractedFields);
    const mergedEf: Record<string, Record<string, unknown>> = { ...topLevelCandidates, ...baseEf };

    // For loan/mortgage docs: flatten nested legacy format (client, loanDetails, paymentDetails)
    if (LOAN_MORTGAGE_PRIMARY_TYPES.has(forcedPrimaryType)) {
      flattenLegacyLoanNestedFields(draft, mergedEf);
    }

    // For investment/subscription docs: flatten nested legacy format (investor, fund, payment)
    if (
      forcedPrimaryType === "investment_subscription_document" ||
      forcedPrimaryType === "investment_service_agreement" ||
      forcedPrimaryType === "investment_modelation" ||
      forcedPrimaryType === "pension_contract"
    ) {
      flattenLegacyInvestmentNestedFields(draft, mergedEf);
    }

    // For leasing/financing docs: flatten nested legacy format (customer, vehicleDetails, financingTerms)
    if (forcedPrimaryType === "generic_financial_document") {
      flattenLegacyLeasingNestedFields(draft, mergedEf);
    }

    // For amendment/change/proposal/service docs: flatten insurer, client, contract ref, payments
    // This covers cases where LLM used different key names than canonical extractedFields.
    if (
      AMENDMENT_PROPOSAL_PRIMARY_TYPES.has(forcedPrimaryType) ||
      forcedPrimaryType === "insurance_policy_change_or_service_doc"
    ) {
      flattenAmendmentProposalFields(draft, mergedEf);
    }

    // For supporting docs (payslip, tax return, bank statement): flatten to ensure non-empty export
    if (SUPPORTING_DOC_PRIMARY_TYPES.has(forcedPrimaryType)) {
      flattenSupportingDocFields(draft, mergedEf);
    }

    // For non-life insurance: infer insuredObject when missing (GČP odpovědnost case)
    if (NONLIFE_PRIMARY_TYPES.has(forcedPrimaryType)) {
      flattenAmendmentProposalFields(draft, mergedEf); // also run amendment flatten for GČP
      inferInsuredObjectForNonlife(mergedEf);
    }

    draft.extractedFields = mergedEf;
    if (draft.parties == null || typeof draft.parties !== "object" || Array.isArray(draft.parties)) {
      draft.parties = {};
    }
    if (!Array.isArray(draft.productsOrObligations)) {
      draft.productsOrObligations = [];
    }
    if (draft.financialTerms == null || typeof draft.financialTerms !== "object" || Array.isArray(draft.financialTerms)) {
      draft.financialTerms = {};
    }
    if (draft.serviceTerms == null || typeof draft.serviceTerms !== "object" || Array.isArray(draft.serviceTerms)) {
      draft.serviceTerms = {};
    }
    draft.evidence = coerceEvidence(draft.evidence);
    draft.reviewWarnings = coerceReviewWarnings(draft.reviewWarnings);
    draft.suggestedActions = coerceSuggestedActions(draft.suggestedActions);

    if (draft.candidateMatches != null && (typeof draft.candidateMatches !== "object" || Array.isArray(draft.candidateMatches))) {
      delete draft.candidateMatches;
    }
    if (draft.dataCompleteness != null && (typeof draft.dataCompleteness !== "object" || Array.isArray(draft.dataCompleteness))) {
      delete draft.dataCompleteness;
    }
    if (draft.sectionSensitivity != null && (typeof draft.sectionSensitivity !== "object" || Array.isArray(draft.sectionSensitivity))) {
      draft.sectionSensitivity = {};
    }

    const result = documentReviewEnvelopeSchema.safeParse(draft);
    return result.success ? result.data : null;
  } finally {
    docClassificationConfidenceForPartialCoerce = prevDocConf;
  }
}

/**
 * When coercion still fails, copy any parseable extractedFields / parties into the manual-review stub
 * so the UI can show partial rows.
 */
export function mergePartialParsedIntoManualStub(
  stub: DocumentReviewEnvelope,
  parsed: Record<string, unknown> | null,
  rawCharLength: number
): { mergedFieldKeys: string[]; mergedPartyKeys: string[] } {
  const mergedFieldKeys: string[] = [];
  const mergedPartyKeys: string[] = [];
  if (!parsed) {
    stub.debug = {
      ...(stub.debug ?? {}),
      partialMerge: { attempted: false, rawCharLength },
    };
    return { mergedFieldKeys, mergedPartyKeys };
  }

  const prevDocConf = docClassificationConfidenceForPartialCoerce;
  const stubDcConf = stub.documentClassification?.confidence;
  docClassificationConfidenceForPartialCoerce =
    typeof stubDcConf === "number" && Number.isFinite(stubDcConf) ? stubDcConf : undefined;
  try {
    const rootCandidates = collectTopLevelFieldCandidates(parsed);
    const mergedEf: Record<string, Record<string, unknown>> = {};

    for (const [k, v] of Object.entries(rootCandidates)) {
      mergedEf[k] = v;
    }

    const ef = parsed.extractedFields;
    if (ef && typeof ef === "object" && !Array.isArray(ef)) {
      for (const [k, v] of Object.entries(ef as Record<string, unknown>)) {
        if (k.startsWith("_")) continue;
        if (mergedEf[k]) continue;
        mergedEf[k] = normalizeExtractedFieldCell(k, v);
      }
    }

    // Apply domain-specific flatten based on stub's detected document type
    const stubPrimary = stub.documentClassification?.primaryType ?? "";
    if (AMENDMENT_PROPOSAL_PRIMARY_TYPES.has(stubPrimary) || stubPrimary === "insurance_policy_change_or_service_doc") {
      flattenAmendmentProposalFields(parsed, mergedEf);
    }
    if (SUPPORTING_DOC_PRIMARY_TYPES.has(stubPrimary)) {
      flattenSupportingDocFields(parsed, mergedEf);
    }
    if (LOAN_MORTGAGE_PRIMARY_TYPES.has(stubPrimary)) {
      flattenLegacyLoanNestedFields(parsed, mergedEf);
    }
    if (
      stubPrimary === "investment_subscription_document" ||
      stubPrimary === "investment_service_agreement" ||
      stubPrimary === "investment_modelation" ||
      stubPrimary === "pension_contract"
    ) {
      flattenLegacyInvestmentNestedFields(parsed, mergedEf);
    }
    if (NONLIFE_PRIMARY_TYPES.has(stubPrimary)) {
      flattenAmendmentProposalFields(parsed, mergedEf);
      inferInsuredObjectForNonlife(mergedEf);
    }

    // Write merged fields into stub
    for (const [k, v] of Object.entries(mergedEf)) {
      stub.extractedFields[k] = v as DocumentReviewEnvelope["extractedFields"][string];
      mergedFieldKeys.push(k);
    }

    const parties = parsed.parties;
    if (Array.isArray(parties)) {
      for (let i = 0; i < parties.length; i++) {
        const p = parties[i];
        if (!p || typeof p !== "object" || Array.isArray(p)) continue;
        const rec = p as Record<string, unknown>;
        const roleRaw = typeof rec.role === "string" ? rec.role.trim() : "";
        const key = roleRaw
          ? roleRaw.toLowerCase().replace(/\s+/g, "_")
          : `party_${i}`;
        if (key.startsWith("_")) continue;
        stub.parties[key] = rec;
        mergedPartyKeys.push(key);
      }
    } else if (parties && typeof parties === "object") {
      for (const [k, v] of Object.entries(parties as Record<string, unknown>)) {
        if (k.startsWith("_")) continue;
        stub.parties[k] = v;
        mergedPartyKeys.push(k);
      }
    }

    const topKeys = Object.keys(parsed).filter((k) => !k.startsWith("_")).slice(0, 32);
    stub.debug = {
      ...(stub.debug ?? {}),
      partialMerge: {
        attempted: true,
        rawCharLength,
        topLevelKeys: topKeys,
        mergedExtractedFieldCount: mergedFieldKeys.length,
        mergedPartyCount: mergedPartyKeys.length,
      },
    };

    return { mergedFieldKeys, mergedPartyKeys };
  } finally {
    docClassificationConfidenceForPartialCoerce = prevDocConf;
  }
}
