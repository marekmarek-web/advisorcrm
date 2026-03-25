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

const MAX_DOCUMENT_TEXT_CHARS = 120_000;

/**
 * Second-pass extraction from preprocess markdown/OCR text (no second PDF upload to the model).
 */
export function wrapExtractionPromptWithDocumentText(
  extractionPrompt: string,
  documentMarkdown: string
): string {
  const trimmed = documentMarkdown.trim();
  const body =
    trimmed.length > MAX_DOCUMENT_TEXT_CHARS
      ? `${trimmed.slice(0, MAX_DOCUMENT_TEXT_CHARS)}\n\n[… dokument zkrácen kvůli limitu délky …]`
      : trimmed;
  return `${extractionPrompt}

---

Níže je text dokumentu (převod z PDF / OCR). Extrahuj údaje výhradně z tohoto textu. Chybějící pole označ podle pravidel výše (missing / unknown).

<<<DOCUMENT_TEXT>>>
${body}
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
