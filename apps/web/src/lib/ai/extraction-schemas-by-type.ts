/**
 * Schema router + extraction envelope validators.
 * Keeps compatibility with previous imports while moving to type-specific extraction envelopes.
 */

import { z } from "zod";
import type { ContractDocumentType } from "./document-classification";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { documentReviewEnvelopeSchema } from "./document-review-types";
import {
  buildSchemaPrompt,
  safeParseReviewEnvelope,
} from "./document-schema-registry";
import { resolveDocumentSchema } from "./document-schema-router";

/** Legacy export kept for compatibility with older tests/UI pieces. */
export const SECTION_CONFIDENCE_KEYS = [
  "contract",
  "client",
  "institution",
  "product",
  "paymentDetails",
  "dates",
] as const;

export type SectionConfidenceKey = (typeof SECTION_CONFIDENCE_KEYS)[number];

export const sectionConfidenceMapSchema = z.record(
  z.enum(SECTION_CONFIDENCE_KEYS),
  z.number().min(0).max(1)
).optional();

export const extractedContractByTypeSchema = documentReviewEnvelopeSchema;
export type ExtractedContractByType = DocumentReviewEnvelope;

export type SchemaPromptInfo = {
  schema: typeof extractedContractByTypeSchema;
  promptFragment: string;
};

export function getSchemaForDocumentType(
  documentType: ContractDocumentType
): SchemaPromptInfo {
  const definition = resolveDocumentSchema(documentType);
  return {
    schema: extractedContractByTypeSchema,
    promptFragment: definition.extractionRules.reviewRules.join(" | "),
  };
}

export function buildExtractionPrompt(
  documentType: ContractDocumentType,
  isScanFallback: boolean
): string {
  const definition = resolveDocumentSchema(documentType);
  return buildSchemaPrompt(definition, isScanFallback);
}

/** Target max chars sent to extraction LLM (full doc rarely needed). */
export const EXTRACTION_DOCUMENT_TEXT_MAX_CHARS = 28_000;
const HEAD_FRACTION = 0.72;

export type ExcerptForExtractionOptions = {
  maxChars?: number;
  headFraction?: number;
};

/**
 * Prefer the leading portion of markdown/OCR text (most contracts put key fields early).
 * Optionally keep a short tail for signatures / payment blocks.
 */
export function selectExcerptForExtraction(
  documentMarkdown: string,
  options?: ExcerptForExtractionOptions
): { text: string; truncated: boolean } {
  const maxChars = options?.maxChars ?? EXTRACTION_DOCUMENT_TEXT_MAX_CHARS;
  const headFrac = options?.headFraction ?? HEAD_FRACTION;
  const trimmed = documentMarkdown.trim();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false };
  }
  const headLen = Math.floor(maxChars * headFrac);
  const tailLen = Math.max(0, maxChars - headLen - 80);
  const head = trimmed.slice(0, headLen);
  const tail = tailLen > 0 ? trimmed.slice(-tailLen) : "";
  const glue = tail ? "\n\n[… střed dokumentu vynechán …]\n\n" : "\n\n[… dokument zkrácen …]\n";
  return {
    text: `${head}${glue}${tail}`.slice(0, maxChars + 200),
    truncated: true,
  };
}

/**
 * Second-pass extraction from preprocess markdown/OCR text (no second PDF upload to the model).
 */
export function wrapExtractionPromptWithDocumentText(
  extractionPrompt: string,
  documentMarkdown: string,
  excerptOptions?: ExcerptForExtractionOptions
): string {
  const { text: body, truncated } = selectExcerptForExtraction(documentMarkdown, excerptOptions);
  const suffix = truncated ? "\n\n[Text byl zkrácen pro extrakci — preferuj údaje z uvedených částí.]" : "";
  return `${extractionPrompt}

---

Níže je text dokumentu (převod z PDF / OCR). Extrahuj údaje výhradně z tohoto textu. Chybějící pole označ podle pravidel výše (missing / unknown).

<<<DOCUMENT_TEXT>>>
${body}${suffix}
<<<END_DOCUMENT_TEXT>>>
`;
}

export function validateExtractionByType(
  raw: string,
  documentType: ContractDocumentType
): { ok: true; data: ExtractedContractByType } | { ok: false; issues: z.ZodIssue[] } {
  const parsed = safeParseReviewEnvelope(raw);
  if (!parsed.ok) return parsed;
  // Force classification fallback when model drifts type.
  if (parsed.data.documentClassification.primaryType !== documentType) {
    parsed.data.documentClassification.primaryType = documentType;
  }
  return { ok: true, data: parsed.data };
}
