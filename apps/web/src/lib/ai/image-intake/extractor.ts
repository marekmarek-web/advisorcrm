/**
 * AI Photo / Image Intake — fact extraction v1 (Phase 3).
 *
 * Converts MultimodalCombinedPassResult → ExtractedFactBundle.
 * Pure transformation — no additional model calls.
 * The multimodal pass already did the heavy lifting.
 *
 * Also provides `buildSupportingReferenceFacts()` for archive-path images
 * that get a template fact bundle without any model call.
 */

import type {
  ExtractedFactBundle,
  ExtractedImageFact,
  MultimodalCombinedPassResult,
  ImageInputType,
  FactType,
  EvidenceReference,
} from "./types";

// ---------------------------------------------------------------------------
// factKey → FactType mapping
// ---------------------------------------------------------------------------

const FACT_KEY_TO_TYPE: Record<string, FactType> = {
  what_client_said: "client_request",
  what_client_wants: "client_request",
  what_changed: "client_status_change",
  required_follow_up: "follow_up_needed",
  urgency_signal: "client_request",
  possible_date_mention: "appointment_request",
  amount: "payment_amount",
  account_number: "payment_account",
  variable_symbol: "variable_symbol",
  due_date: "deadline_date",
  recipient: "payment_account",
  payment_method: "reference_only",
  is_complete: "reference_only",
  balance_or_amount: "payment_amount",
  transaction_description: "reference_only",
  product_or_account_type: "reference_only",
  date_range: "reference_only",
  is_supporting_only: "reference_only",
  document_type: "document_received",
  document_summary: "document_received",
  key_fact_1: "document_received",
  key_fact_2: "document_received",
  key_fact_3: "document_received",
  looks_like_contract: "document_received",
  relevance_summary: "reference_only",
  why_supporting: "reference_only",
};

function resolveFactType(factKey: string): FactType {
  return FACT_KEY_TO_TYPE[factKey] ?? "unknown_unusable";
}

// ---------------------------------------------------------------------------
// Actionability mapping
// ---------------------------------------------------------------------------

const ACTIONABLE_FACT_KEYS = new Set([
  "what_client_wants",
  "required_follow_up",
  "amount",
  "account_number",
  "variable_symbol",
  "due_date",
  "possible_date_mention",
]);

function isFactActionable(factKey: string, inputType: ImageInputType): boolean {
  if (ACTIONABLE_FACT_KEYS.has(factKey)) return true;
  if (inputType === "screenshot_client_communication" && factKey === "what_client_said") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Build evidence reference from asset ID + fact
// ---------------------------------------------------------------------------

function buildEvidenceRef(assetId: string, fact: MultimodalCombinedPassResult["facts"][number]): EvidenceReference {
  return {
    sourceAssetId: assetId,
    evidenceText: fact.value ?? null,
    sourceRegion: null,
    confidence: fact.confidence,
  };
}

// ---------------------------------------------------------------------------
// Convert multimodal pass facts → ExtractedImageFact[]
// ---------------------------------------------------------------------------

function convertFacts(
  rawFacts: MultimodalCombinedPassResult["facts"],
  inputType: ImageInputType,
  assetId: string,
): ExtractedImageFact[] {
  return rawFacts
    .filter((f) => f.value !== null && f.value.trim() !== "" && f.factKey.trim() !== "")
    .map((f): ExtractedImageFact => ({
      factType: resolveFactType(f.factKey),
      value: f.value,
      normalizedValue: f.value,
      confidence: f.confidence,
      evidence: buildEvidenceRef(assetId, f),
      isActionable: isFactActionable(f.factKey, inputType),
      needsConfirmation: f.confidence < 0.8 || f.source === "inferred",
      observedVsInferred: f.source,
      factKey: f.factKey,
    }));
}

// ---------------------------------------------------------------------------
// Extract from multimodal pass (primary path)
// ---------------------------------------------------------------------------

/**
 * Converts multimodal combined pass result to ExtractedFactBundle.
 * Pure transformation — no model calls.
 */
export function extractFactsFromMultimodalPass(
  passResult: MultimodalCombinedPassResult,
  assetId: string,
): ExtractedFactBundle {
  const facts = convertFacts(passResult.facts, passResult.inputType, assetId);

  return {
    facts,
    missingFields: passResult.missingFields,
    ambiguityReasons: passResult.ambiguityReasons,
    extractionSource: "multimodal_pass",
  };
}

// ---------------------------------------------------------------------------
// Template fact bundles for non-extraction paths
// ---------------------------------------------------------------------------

/**
 * Builds a template fact bundle for supporting/reference images.
 * No model call — uses classification metadata only.
 */
export function buildSupportingReferenceFacts(assetId: string): ExtractedFactBundle {
  const fact: ExtractedImageFact = {
    factType: "reference_only",
    value: "Referenční podklad — neobsahuje extrahovaná strukturovaná fakta.",
    normalizedValue: null,
    confidence: 1.0,
    evidence: { sourceAssetId: assetId, evidenceText: null, sourceRegion: null, confidence: 1.0 },
    isActionable: false,
    needsConfirmation: false,
    observedVsInferred: "inferred",
    factKey: "reference_classification",
  };
  return {
    facts: [fact],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "stub",
  };
}

/**
 * Builds a fact bundle for unusable images.
 */
export function buildUnusableFacts(): ExtractedFactBundle {
  return {
    facts: [],
    missingFields: ["image_content"],
    ambiguityReasons: ["Image není použitelný pro extrakci faktů."],
    extractionSource: "stub",
  };
}

// ---------------------------------------------------------------------------
// Richer fact summary for preview
// ---------------------------------------------------------------------------

/**
 * Returns human-readable summary lines from a fact bundle.
 * Used by response-mapper.ts for preview enrichment.
 */
export function buildFactsSummaryLines(bundle: ExtractedFactBundle, limit = 6): string[] {
  if (bundle.facts.length === 0) {
    if (bundle.ambiguityReasons.length > 0) {
      return bundle.ambiguityReasons.slice(0, 2);
    }
    return [];
  }

  return bundle.facts
    .filter((f) => f.value !== null && f.value !== "" && f.factKey !== "reference_classification")
    .slice(0, limit)
    .map((f) => {
      const label = factKeyLabel(f.factKey);
      const conf = f.confidence < 0.7 ? " (nejisté)" : "";
      const inferred = f.observedVsInferred === "inferred" ? " [odvozeno]" : "";
      return `${label}: ${String(f.value).slice(0, 120)}${conf}${inferred}`;
    });
}

function factKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    what_client_said: "Klient napsal",
    what_client_wants: "Klient požaduje",
    what_changed: "Co se změnilo",
    required_follow_up: "Potřebná akce",
    urgency_signal: "Naléhavost",
    possible_date_mention: "Zmíněný termín",
    amount: "Částka",
    account_number: "Číslo účtu",
    variable_symbol: "Variabilní symbol",
    due_date: "Splatnost",
    recipient: "Příjemce",
    payment_method: "Způsob platby",
    is_complete: "Úplnost dat",
    balance_or_amount: "Zůstatek/částka",
    transaction_description: "Popis transakce",
    product_or_account_type: "Typ produktu",
    date_range: "Období",
    document_type: "Typ dokumentu",
    document_summary: "Obsah dokumentu",
    key_fact_1: "Klíčový fakt 1",
    key_fact_2: "Klíčový fakt 2",
    key_fact_3: "Klíčový fakt 3",
    relevance_summary: "Relevance",
    reference_classification: "Kategorie",
  };
  return labels[key] ?? key;
}
