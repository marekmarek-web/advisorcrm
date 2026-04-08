/**
 * AI Photo / Image Intake — AI Review handoff boundary v1 (Phase 4).
 *
 * Detects when an image looks like a review-candidate document and
 * returns an explicit handoff recommendation WITHOUT actually triggering
 * AI Review. The advisory stays in image intake lane.
 *
 * Safety rules:
 * - Image intake lane never performs AI Review work
 * - No automatic redirect — handoff is a recommendation, not an action
 * - Communication screenshots, payment screenshots, bank screenshots
 *   are explicitly excluded from handoff recommendation
 * - Handoff is only relevant for document-like inputs
 * - Boundary is testable and explainable
 *
 * Cost:
 * - No additional model calls — reuses classification + extraction results
 * - Signal detection is pure logic from existing classifier output
 */

import type {
  InputClassificationResult,
  ExtractedFactBundle,
  ReviewHandoffRecommendation,
  ReviewHandoffSignal,
  ImageInputType,
} from "./types";

// ---------------------------------------------------------------------------
// Types that must NEVER trigger handoff recommendation
// ---------------------------------------------------------------------------

const NEVER_HANDOFF_TYPES = new Set<ImageInputType>([
  "screenshot_client_communication",
  "screenshot_payment_details",
  "screenshot_bank_or_finance_info",
  "supporting_reference_image",
  "general_unusable_image",
]);

// ---------------------------------------------------------------------------
// Structured form detection — backoffice / admin UI screenshots
// ---------------------------------------------------------------------------

const STRUCTURED_FORM_FACT_KEYS = new Set([
  "client_name", "first_name", "last_name", "birth_date", "birth_number",
  "street", "city", "zip", "state", "country", "phone", "email",
  "contract_number", "product", "partner", "payment_frequency",
  "validity_from", "validity_to", "document_number", "document_type_id",
  "gender", "citizenship", "birth_place", "title",
]);

export function looksLikeStructuredFormScreenshot(factBundle: ExtractedFactBundle): boolean {
  const formFieldCount = factBundle.facts.filter(
    (f) => STRUCTURED_FORM_FACT_KEYS.has(f.factKey) || /^(field_|form_|input_)/.test(f.factKey),
  ).length;
  return formFieldCount >= 4;
}

// ---------------------------------------------------------------------------
// Signal detection from classification + extraction facts
// ---------------------------------------------------------------------------

function detectHandoffSignals(
  classification: InputClassificationResult,
  factBundle: ExtractedFactBundle,
): ReviewHandoffSignal[] {
  const signals: ReviewHandoffSignal[] = [];

  if (classification.inputType !== "photo_or_scan_document" &&
      classification.inputType !== "mixed_or_uncertain_image") {
    return signals;
  }

  // Structured form screenshots (backoffice / admin UI) are NOT review candidates.
  // They contain CRM-extractable fields, not dense legal text.
  if (looksLikeStructuredFormScreenshot(factBundle)) {
    return signals;
  }

  // Detect from fact keys
  const factKeys = new Set(factBundle.facts.map((f) => f.factKey));
  const factValues = factBundle.facts.map((f) => String(f.value ?? "").toLowerCase());

  const docTypeFact = factBundle.facts.find((f) => f.factKey === "document_type");
  const docTypeValue = String(docTypeFact?.value ?? "").toLowerCase();
  const docSummaryFact = factBundle.facts.find((f) => f.factKey === "document_summary");
  const docSummaryValue = String(docSummaryFact?.value ?? "").toLowerCase();

  const isContractLike = factBundle.facts.some((f) => f.factKey === "looks_like_contract" && f.value === "yes");

  // Contract-like document
  if (isContractLike ||
      docTypeValue.includes("smlouv") ||
      docTypeValue.includes("contract") ||
      docTypeValue.includes("pojist")) {
    signals.push("contract_like_document");
  }

  // Insurance policy
  if (
    docTypeValue.includes("pojistk") ||
    docTypeValue.includes("polica") ||
    docSummaryValue.includes("pojistk") ||
    factValues.some((v) => v.includes("pojistk") || v.includes("pojistná smlouva"))
  ) {
    signals.push("insurance_policy_attachment");
  }

  // Dense legal text signal (from classification uncertainty flags or likelyDocument)
  if (classification.likelyDocument && classification.confidence > 0.7) {
    if (!signals.includes("contract_like_document")) {
      signals.push("formal_policy_document");
    }
  }

  // Multi-page document scan hint
  if (
    docSummaryValue.includes("stran") ||
    docSummaryValue.includes("pages") ||
    factValues.some((v) => v.includes("stran") || v.includes("pages"))
  ) {
    signals.push("multi_page_document_scan");
  }

  // Dense legal text (from document_summary content)
  if (
    docSummaryValue.includes("podmínk") ||
    docSummaryValue.includes("paragrafy") ||
    docSummaryValue.includes("právní") ||
    docSummaryValue.includes("zákonné")
  ) {
    signals.push("dense_legal_text");
  }

  return [...new Set(signals)]; // deduplicate
}

// ---------------------------------------------------------------------------
// Confidence from signal count
// ---------------------------------------------------------------------------

function signalConfidence(signals: ReviewHandoffSignal[]): number {
  if (signals.length === 0) return 0.0;
  if (signals.length === 1) return 0.55;
  if (signals.length === 2) return 0.75;
  return 0.90;
}

// ---------------------------------------------------------------------------
// Advisor explanation
// ---------------------------------------------------------------------------

function buildAdvisorExplanation(
  signals: ReviewHandoffSignal[],
  inputType: InputClassificationResult["inputType"],
): string {
  if (signals.length === 0) {
    return "Obrázek neobsahuje silné signály typické pro AI Review dokumenty.";
  }

  const signalLabels: Record<ReviewHandoffSignal, string> = {
    contract_like_document: "obsahuje znaky smlouvy",
    multi_page_document_scan: "pravděpodobně vícestránkový sken",
    formal_policy_document: "formální pojistná dokumentace",
    dense_legal_text: "hustý právní text",
    insurance_policy_attachment: "pojistná smlouva nebo polica",
  };

  const labelList = signals.map((s) => signalLabels[s]).join(", ");
  return (
    `Tento dokument vykazuje znaky vhodné pro AI Review (${labelList}). ` +
    `Image intake extrahovala jen orientační přehled. ` +
    `Pro strukturovanou analýzu smlouvy/pojistky doporučujeme spustit AI Review.`
  );
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Evaluates whether the current image should be recommended for AI Review handoff.
 *
 * Returns a recommendation — NOT an action. Advisor must confirm any handoff.
 * Never triggers AI Review automatically.
 *
 * @param handoffFlagEnabled - whether IMAGE_INTAKE_REVIEW_HANDOFF_ENABLED is true
 */
export function evaluateReviewHandoff(
  classification: InputClassificationResult | null,
  factBundle: ExtractedFactBundle,
  handoffFlagEnabled: boolean,
): ReviewHandoffRecommendation {
  if (!classification) {
    return noHandoff("Klasifikace není dostupná.");
  }

  // Hard exclusion: these types must NEVER be recommended for AI Review
  if (NEVER_HANDOFF_TYPES.has(classification.inputType)) {
    return noHandoff(
      `Typ vstupu "${classification.inputType}" nepodléhá AI Review handoff.`,
    );
  }

  const signals = detectHandoffSignals(classification, factBundle);

  if (signals.length === 0) {
    return noHandoff("Žádné signály vhodné pro AI Review nebyly detekovány.");
  }

  const confidence = signalConfidence(signals);
  const explanation = buildAdvisorExplanation(signals, classification.inputType);
  const orientationSummary = factBundle.facts.find((f) => f.factKey === "document_summary")?.value
    ? String(factBundle.facts.find((f) => f.factKey === "document_summary")!.value).slice(0, 200)
    : null;

  return {
    recommended: true,
    signals,
    confidence,
    orientationSummary,
    advisorExplanation: explanation,
    // handoffReady requires both the flag and sufficient confidence
    handoffReady: handoffFlagEnabled && confidence >= 0.55,
  };
}

function noHandoff(reason: string): ReviewHandoffRecommendation {
  return {
    recommended: false,
    signals: [],
    confidence: 0.0,
    orientationSummary: null,
    advisorExplanation: reason,
    handoffReady: false,
  };
}
