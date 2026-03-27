/**
 * Prompt Builder variable contracts for AI Review (OpenAI Responses + pmpt_*).
 * Required keys must be non-empty strings before calling OpenAI.
 */

import type { AiReviewPromptKey } from "./prompt-model-registry";
import { selectExcerptForExtraction } from "./extraction-schemas-by-type";

/** Extraction-style prompts: unified variable set (ai-review-*-extraction-v1 family). */
export const AI_REVIEW_EXTRACTION_PROMPT_VARS = [
  "extracted_text",
  "classification_reasons",
  "adobe_signals",
  "filename",
  /** Legacy alias still accepted by some templates — same value as extracted_text when dual-send enabled */
  "document_text",
] as const;

const EXTRACTION_REQUIRED: readonly string[] = [
  "extracted_text",
  "classification_reasons",
  "adobe_signals",
  "filename",
];

/** Payment instructions extraction: same body fields as other extractions for Prompt Builder parity. */
const PAYMENT_EXTRACTION_REQUIRED: readonly string[] = EXTRACTION_REQUIRED;

/** Doc classifier v2 Prompt Builder — must match `buildDocClassifierPromptVariables` keys. */
const DOC_CLASSIFIER_V2_REQUIRED: readonly string[] = [
  "filename",
  "page_count",
  "input_mode",
  "text_excerpt",
  "adobe_signals",
  "source_channel",
];

export const AI_REVIEW_PROMPT_REQUIRED_VARS: Partial<Record<AiReviewPromptKey, readonly string[]>> = {
  docClassifierV2: DOC_CLASSIFIER_V2_REQUIRED,
  insuranceContractExtraction: EXTRACTION_REQUIRED,
  insuranceProposalModelation: EXTRACTION_REQUIRED,
  insuranceAmendment: EXTRACTION_REQUIRED,
  nonLifeInsuranceExtraction: EXTRACTION_REQUIRED,
  carInsuranceExtraction: EXTRACTION_REQUIRED,
  investmentContractExtraction: EXTRACTION_REQUIRED,
  investmentProposal: EXTRACTION_REQUIRED,
  retirementProductExtraction: EXTRACTION_REQUIRED,
  dipExtraction: EXTRACTION_REQUIRED,
  buildingSavingsExtraction: EXTRACTION_REQUIRED,
  loanContractExtraction: EXTRACTION_REQUIRED,
  mortgageExtraction: EXTRACTION_REQUIRED,
  paymentInstructionsExtraction: PAYMENT_EXTRACTION_REQUIRED,
  supportingDocumentExtraction: EXTRACTION_REQUIRED,
  legacyFinancialProductExtraction: EXTRACTION_REQUIRED,
  terminationDocumentExtraction: EXTRACTION_REQUIRED,
  consentIdentificationExtraction: EXTRACTION_REQUIRED,
  confirmationDocumentExtraction: EXTRACTION_REQUIRED,
  reviewDecision: [
    "normalized_document_type",
    "extraction_payload",
    "validation_warnings",
    "section_confidence_summary",
    "input_mode",
    "preprocess_warnings",
  ],
  clientMatch: ["extracted_client_payload", "existing_client_candidates"],
};

export function getRequiredVarsForAiReviewPrompt(key: AiReviewPromptKey): readonly string[] | undefined {
  return AI_REVIEW_PROMPT_REQUIRED_VARS[key];
}

/**
 * Returns missing required variable names (empty or whitespace-only values count as missing).
 */
export function findMissingAiReviewPromptVariables(
  key: AiReviewPromptKey,
  variables: Record<string, string>
): string[] {
  const required = getRequiredVarsForAiReviewPrompt(key);
  if (!required?.length) return [];
  const missing: string[] = [];
  for (const name of required) {
    const v = variables[name];
    if (typeof v !== "string" || !v.trim()) missing.push(name);
  }
  return missing;
}

export type BuildExtractionPromptVariablesParams = {
  documentText: string;
  classificationReasons: string[];
  adobeSignals: string;
  filename: string;
  /** When true, also set document_text = extracted_text for older Prompt Builder templates */
  includeLegacyDocumentText?: boolean;
};

/**
 * Builds variables for extraction/payment Prompt Builder prompts.
 */
export function buildAiReviewExtractionPromptVariables(
  params: BuildExtractionPromptVariablesParams
): Record<string, string> {
  const extracted = selectExcerptHelper(params.documentText);
  const reasons =
    params.classificationReasons?.length > 0
      ? JSON.stringify(params.classificationReasons)
      : "[]";
  const fn = params.filename?.trim() || "unknown";
  const adobe = params.adobeSignals?.trim() || "none";
  const out: Record<string, string> = {
    extracted_text: extracted,
    classification_reasons: reasons,
    adobe_signals: adobe,
    filename: fn,
  };
  if (params.includeLegacyDocumentText !== false) {
    out.document_text = extracted;
  }
  return out;
}

function selectExcerptHelper(text: string): string {
  const t = text.trim();
  if (!t) return "(no text)";
  return selectExcerptForExtraction(t).text;
}

const DEFAULT_PROMPT_VAR_MAX = 120_000;

/** Truncate large JSON/text for Prompt Builder payloads (keeps requests within model limits). */
export function capAiReviewPromptString(value: string, maxChars: number = DEFAULT_PROMPT_VAR_MAX): string {
  const s = value.trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n…[truncated ${s.length - maxChars} chars]`;
}
