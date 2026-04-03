/**
 * Hosted prompt `insuranceProposalModelation` often returns a flat / nested JSON that is not
 * a valid DocumentReviewEnvelope. This module upgrades that shape before Zod validation.
 */

import type { ClassificationResult } from "./document-classification";
import type { ContractDocumentType } from "./document-classification";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { safeParseReviewEnvelope } from "./document-schema-registry";
import { parseJsonObjectFromAiReviewRaw } from "./coerce-partial-review-envelope";
import type { AiReviewPromptKey } from "./prompt-model-registry";
import { PRIMARY_DOCUMENT_TYPES } from "./document-review-types";

const PRIMARY_SET = new Set<string>(PRIMARY_DOCUMENT_TYPES);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function mkCell(
  value: unknown,
  status: "extracted" | "inferred_low_confidence" = "extracted",
  confidence = 0.78
): { value: unknown; status: typeof status; confidence: number } | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return { value, status, confidence };
}

function put(
  ef: Record<string, NonNullable<ReturnType<typeof mkCell>>>,
  key: string,
  value: unknown,
  conf?: number
): void {
  const c = mkCell(value, "extracted", conf ?? 0.78);
  if (c) ef[key] = c;
}

function readClientBlob(root: Record<string, unknown>): Record<string, unknown> | null {
  const c = root.client ?? root.policyholderClient ?? root.insuredClient;
  if (isPlainObject(c)) return c;
  return null;
}

function readPaymentBlob(root: Record<string, unknown>): Record<string, unknown> | null {
  const p =
    root.illustrativePaymentDetails ??
    root.paymentDetails ??
    root.payment ??
    root.bankPaymentInfo_if_present;
  if (isPlainObject(p)) return p;
  return null;
}

function readIntermediaryBlob(root: Record<string, unknown>): Record<string, unknown> | null {
  const i = root.intermediary ?? root.advisor ?? root.broker;
  if (isPlainObject(i)) return i;
  return null;
}

function flattenClientIntoFields(
  client: Record<string, unknown>,
  ef: Record<string, NonNullable<ReturnType<typeof mkCell>>>
): void {
  const fullName =
    str(client.fullName) ||
    str(client.name) ||
    [str(client.firstName), str(client.lastName)].filter(Boolean).join(" ").trim();
  put(ef, "fullName", fullName || undefined);
  put(ef, "firstName", str(client.firstName) || undefined);
  put(ef, "lastName", str(client.lastName) || undefined);
  put(ef, "birthDate", str(client.birthDate) || str(client.dateOfBirth) || undefined);
  put(ef, "personalId", str(client.personalId) || str(client.rodneCislo) || str(client.nationalId) || undefined);
  put(ef, "address", str(client.address) || str(client.permanentAddress) || str(client.adresa) || undefined);
  put(ef, "permanentAddress", str(client.permanentAddress) || undefined);
  put(ef, "phone", str(client.phone) || str(client.telefon) || str(client.mobile) || undefined);
  put(ef, "email", str(client.email) || undefined);
  put(ef, "occupation", str(client.occupation) || str(client.povolani) || undefined);
  put(ef, "sports", str(client.sports) || str(client.sportsAndHobbies) || undefined);
}

function flattenPaymentIntoFields(
  pay: Record<string, unknown>,
  ef: Record<string, NonNullable<ReturnType<typeof mkCell>>>
): void {
  put(
    ef,
    "totalMonthlyPremium",
    pay.monthlyPremium ?? pay.monthlyAmount ?? pay.regularPremium ?? pay.premiumMonthly ?? pay.amount
  );
  put(ef, "annualPremium", pay.annualPremium ?? pay.yearlyPremium ?? pay.premiumAnnual);
  put(ef, "modelPremium", pay.modelPremium ?? pay.illustrativePremium);
  put(ef, "paymentFrequency", str(pay.frequency) || str(pay.paymentFrequency) || undefined);
  put(ef, "currency", str(pay.currency) || undefined);
  put(ef, "iban", str(pay.iban) || undefined);
  put(ef, "paymentAccountNumber", str(pay.accountNumber) || str(pay.bankAccount) || str(pay.cisloUctu) || undefined);
  put(ef, "bankCode", str(pay.bankCode) || str(pay.kodBanky) || undefined);
  put(ef, "variableSymbol", str(pay.variableSymbol) || str(pay.vs) || undefined);
  put(ef, "specificSymbol", str(pay.specificSymbol) || str(pay.ss) || undefined);
  put(ef, "constantSymbol", str(pay.constantSymbol) || str(pay.ks) || undefined);
}

function flattenIntermediaryIntoFields(
  im: Record<string, unknown>,
  ef: Record<string, NonNullable<ReturnType<typeof mkCell>>>
): void {
  put(ef, "intermediaryName", str(im.name) || str(im.fullName) || str(im.intermediaryName) || undefined);
  put(ef, "intermediaryCode", str(im.code) || str(im.intermediaryCode) || str(im.brokerCode) || undefined);
  put(ef, "intermediaryCompany", str(im.company) || str(im.intermediaryCompany) || undefined);
  put(ef, "intermediaryPhone", str(im.phone) || str(im.telefon) || undefined);
  put(ef, "intermediaryEmail", str(im.email) || undefined);
  put(ef, "dateSigned", str(im.dateSigned) || str(im.signedAt) || undefined);
}

function mergeExistingExtractedFields(
  raw: unknown,
  ef: Record<string, NonNullable<ReturnType<typeof mkCell>>>
): void {
  if (!isPlainObject(raw)) return;
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (ef[k]) continue;
    const c = mkCell(
      isPlainObject(v) && "value" in v ? (v as { value?: unknown }).value : v,
      (v as { status?: string })?.status === "extracted" ? "extracted" : "inferred_low_confidence",
      typeof (v as { confidence?: number }).confidence === "number"
        ? (v as { confidence: number }).confidence
        : 0.72
    );
    if (c && c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      ef[k] = c;
    }
  }
}

function warningsFromLegacy(root: Record<string, unknown>): Array<{ code: string; message: string; severity: "info" | "warning" }> {
  const out: Array<{ code: string; message: string; severity: "info" | "warning" }> = [];
  const notes = root.importantNotes;
  if (typeof notes === "string" && notes.trim()) {
    out.push({ code: "model_notes", message: notes.trim(), severity: "info" });
  }
  const w = root.warnings;
  if (Array.isArray(w)) {
    for (const item of w) {
      if (typeof item === "string" && item.trim()) {
        out.push({ code: "model_warning", message: item.trim(), severity: "warning" });
      } else if (isPlainObject(item) && str(item.message)) {
        out.push({
          code: str(item.code) || "model_warning",
          message: str(item.message),
          severity: "warning",
        });
      }
    }
  }
  const mf = root.missingFields;
  if (Array.isArray(mf)) {
    const msg = mf.map((x) => String(x)).filter(Boolean).join("; ");
    if (msg) {
      out.push({
        code: "missing_fields_hint",
        message: `Model označil jako chybějící: ${msg}`,
        severity: "info",
      });
    }
  }
  return out;
}

function hasValidEnvelopeClassification(root: Record<string, unknown>): boolean {
  const dc = root.documentClassification;
  if (!isPlainObject(dc)) return false;
  return typeof dc.primaryType === "string" && PRIMARY_SET.has(dc.primaryType as ContractDocumentType);
}

/**
 * True when the payload looks like the legacy insurance proposal / modelation extractor output.
 */
export function isLegacyInsuranceProposalPayload(root: Record<string, unknown>): boolean {
  if (hasValidEnvelopeClassification(root) && isPlainObject(root.extractedFields)) {
    const keys = Object.keys(root.extractedFields).filter((k) => !k.startsWith("_"));
    if (keys.length > 0) return false;
  }
  if (readClientBlob(root)) return true;
  if (readPaymentBlob(root)) return true;
  if (typeof root.normalizedSubtype === "string" && root.normalizedSubtype.trim()) return true;
  if (typeof root.institutionName === "string" && root.institutionName.trim()) return true;
  if (typeof root.proposalNumber === "string" || typeof root.contractNumber === "string") return true;
  return false;
}

export function buildEnvelopeFromLegacyInsuranceProposalJson(
  root: Record<string, unknown>,
  ctx: {
    documentType: ContractDocumentType;
    classification: ClassificationResult;
    normalizedPipeline: string;
  }
): DocumentReviewEnvelope | null {
  const ef: Record<string, NonNullable<ReturnType<typeof mkCell>>> = {};

  const client = readClientBlob(root);
  if (client) flattenClientIntoFields(client, ef);

  const pay = readPaymentBlob(root);
  if (pay) flattenPaymentIntoFields(pay, ef);

  const im = readIntermediaryBlob(root);
  if (im) flattenIntermediaryIntoFields(im, ef);

  put(ef, "insurer", str(root.insurer) || str(root.institutionName) || undefined);
  put(ef, "institutionName", str(root.institutionName) || str(root.insurer) || undefined);
  put(ef, "productName", str(root.productName) || undefined);
  const productTypeHuman =
    str(root.productTypeLabel) || str(root.subtypeLabel) || str(root.productType) || undefined;
  put(ef, "productType", productTypeHuman);
  put(ef, "productSummary", str(root.productSummary) || undefined);

  const rawModelationId = str(root.modelationId);
  const rawProposalNumber = str(root.proposalNumber);
  const rawContractNumber = str(root.contractNumber);
  const rawBusinessCase = str(root.businessCaseNumber);

  const isModelationPipeline =
    ctx.documentType === "life_insurance_modelation" ||
    ctx.normalizedPipeline === "insurance_modelation" ||
    ctx.classification.lifecycleStatus === "modelation" ||
    ctx.classification.lifecycleStatus === "illustration";

  put(ef, "modelationId", rawModelationId || undefined);
  put(ef, "proposalNumber", rawProposalNumber || undefined);
  put(ef, "businessCaseNumber", rawBusinessCase || undefined);

  if (rawContractNumber) {
    if (isModelationPipeline && !rawModelationId && !rawProposalNumber) {
      put(ef, "modelationId", rawContractNumber, 0.6);
    } else {
      put(ef, "contractNumber", rawContractNumber);
    }
  }

  if (!ef.modelationId && isModelationPipeline) {
    const fallbackRef = rawProposalNumber || rawBusinessCase;
    if (fallbackRef) put(ef, "modelationId", fallbackRef, 0.55);
  }

  if (!ef.proposalNumber && !isModelationPipeline) {
    const fallbackRef = rawContractNumber || rawModelationId || rawBusinessCase;
    if (fallbackRef) put(ef, "proposalNumber", fallbackRef, 0.6);
  }

  put(ef, "policyStartDate", str(root.policyStartDate) || str(root.effectiveDate) || str(root.policyStart) || undefined);
  put(ef, "policyEndDate", str(root.policyEndDate) || str(root.endDate) || undefined);
  put(ef, "policyDuration", str(root.policyDuration) || str(root.insuranceTerm) || undefined);
  put(ef, "effectiveDate", str(root.effectiveDate) || undefined);

  put(ef, "documentIssueDate", str(root.documentIssueDate) || str(root.issueDate) || str(root.modelationDate) || undefined);
  put(ef, "modelationDate", str(root.modelationDate) || str(root.documentDate) || undefined);

  const persons = root.insuredPersons ?? root.insured_persons;
  if (Array.isArray(persons) && persons.length) {
    put(ef, "insuredPersons", persons, 0.75);
  }

  for (const k of ["selectedCoverages", "coverages", "riders", "insuredRisks"] as const) {
    const v = root[k];
    if (v != null && (Array.isArray(v) || isPlainObject(v))) {
      put(ef, k, v, 0.72);
    }
  }

  for (const k of [
    "deathBenefit",
    "accidentBenefit",
    "disabilityBenefit",
    "hospitalizationBenefit",
    "seriousIllnessBenefit",
    "investmentScenario",
    "investmentFunds",
  ] as const) {
    if (root[k] != null) put(ef, k, root[k], 0.72);
  }

  mergeExistingExtractedFields(root.extractedFields, ef);

  const docStatus =
    ctx.documentType === "life_insurance_modelation"
      ? "Modelace / nezávazná projekce (není finální smlouva)"
      : "Návrh / nabídka (není finální smlouva)";
  if (!ef.documentStatus) {
    put(ef, "documentStatus", docStatus, 0.9);
  }

  const reviewWarnings = warningsFromLegacy(root);

  const isFinal = root.isFinalContract === true || root.canBeAppliedDirectly === true;
  const isProposal =
    root.isFinalContract === false ||
    root.canBeAppliedDirectly === false ||
    ctx.classification.lifecycleStatus === "proposal" ||
    ctx.classification.lifecycleStatus === "illustration" ||
    ctx.classification.lifecycleStatus === "modelation";

  const subRaw = ctx.classification.subtype?.trim();
  const subtype =
    subRaw && subRaw.length > 0 ? subRaw.slice(0, 120) : undefined;

  const envelope = {
    documentClassification: {
      primaryType: ctx.documentType,
      lifecycleStatus: ctx.classification.lifecycleStatus,
      documentIntent: ctx.classification.documentIntent,
      confidence: ctx.classification.confidence,
      reasons: [...ctx.classification.reasons],
      subtype,
    },
    documentMeta: {
      scannedVsDigital: "unknown" as const,
      normalizedPipelineClassification: ctx.normalizedPipeline,
    },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: ef as DocumentReviewEnvelope["extractedFields"],
    evidence: [],
    candidateMatches: {
      matchedClients: [],
      matchedHouseholds: [],
      matchedDeals: [],
      matchedCompanies: [],
      matchedContracts: [],
      score: 0,
      reason: "no_match",
      ambiguityFlags: [] as string[],
    },
    sectionSensitivity: {} as DocumentReviewEnvelope["sectionSensitivity"],
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    sensitivityProfile: "standard_personal_data" as const,
    reviewWarnings: reviewWarnings.map((w) => ({ ...w, severity: w.severity })),
    suggestedActions: [],
    contentFlags: {
      isFinalContract: Boolean(isFinal),
      isProposalOnly: Boolean(isProposal || !isFinal),
      containsPaymentInstructions: Boolean(pay && Object.keys(pay).length > 0),
      containsClientData: Boolean(client && Object.keys(client).length > 0),
      containsAdvisorData: Boolean(im && Object.keys(im).length > 0),
      containsMultipleDocumentSections: false,
    },
  } satisfies DocumentReviewEnvelope;

  const parsed = safeParseReviewEnvelope(JSON.stringify(envelope), {
    expectedPrimaryType: ctx.documentType,
  });
  return parsed.ok ? parsed.data : null;
}

export function maybeRewriteInsuranceProposalExtractionRaw(
  raw: string,
  ctx: {
    promptKey: AiReviewPromptKey;
    documentType: ContractDocumentType;
    classification: ClassificationResult;
    normalizedPipeline: string;
  }
): string {
  if (ctx.promptKey !== "insuranceProposalModelation") return raw;

  const already = safeParseReviewEnvelope(raw, { expectedPrimaryType: ctx.documentType });
  if (already.ok) return raw;

  const parsed = parseJsonObjectFromAiReviewRaw(raw);
  if (!parsed) return raw;

  if (!isLegacyInsuranceProposalPayload(parsed)) return raw;

  const upgraded = buildEnvelopeFromLegacyInsuranceProposalJson(parsed, {
    documentType: ctx.documentType,
    classification: ctx.classification,
    normalizedPipeline: ctx.normalizedPipeline,
  });
  if (!upgraded) return raw;

  return JSON.stringify(upgraded);
}
