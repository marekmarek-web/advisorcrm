import { z } from "zod";
import { createResponseStructured } from "@/lib/openai";
import {
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  EXTRACTION_FIELD_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
  documentReviewEnvelopeSchema,
  type DocumentReviewEnvelope,
} from "./document-review-types";

export const COMBINED_CLASSIFY_AND_EXTRACT_MIN_HINT_CHARS = 800;

const jsonScalarSchema: Record<string, unknown> = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};

export const combinedClassifyAndExtractJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentClassification",
    "documentMeta",
    "extractedFields",
    "parties",
    "reviewWarnings",
    "suggestedActions",
  ],
  properties: {
    documentClassification: {
      type: "object",
      additionalProperties: false,
      required: ["primaryType", "lifecycleStatus", "documentIntent", "confidence", "reasons"],
      properties: {
        primaryType: { type: "string", enum: [...PRIMARY_DOCUMENT_TYPES] },
        subtype: { type: "string" },
        lifecycleStatus: { type: "string", enum: [...DOCUMENT_LIFECYCLE_STATUSES] },
        documentIntent: { type: "string", enum: [...DOCUMENT_INTENTS] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasons: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    documentMeta: {
      type: "object",
      additionalProperties: false,
      required: ["scannedVsDigital"],
      properties: {
        fileName: { type: "string" },
        pageCount: { type: "integer", minimum: 1 },
        issuer: { type: "string" },
        documentDate: { type: "string" },
        language: { type: "string" },
        scannedVsDigital: { type: "string", enum: ["scanned", "digital", "unknown"] },
        overallConfidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    extractedFields: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["value", "status", "confidence"],
        properties: {
          value: jsonScalarSchema,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          sourcePage: { type: "integer", minimum: 1 },
          evidenceSnippet: { type: "string" },
          status: { type: "string", enum: [...EXTRACTION_FIELD_STATUSES] },
          sensitive: { type: "boolean" },
        },
      },
    },
    parties: {
      type: "object",
      additionalProperties: true,
    },
    reviewWarnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "severity"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          field: { type: "string" },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
        },
      },
    },
    suggestedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label", "payload"],
        properties: {
          type: { type: "string" },
          label: { type: "string" },
          payload: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
};

export function buildCombinedClassifyAndExtractPrompt(
  documentText: string,
  sourceFileName?: string | null
): string {
  const trimmedText = documentText.trim();
  const fileName = sourceFileName?.trim() || "unknown";
  return `Jsi extrakční systém pro finanční dokumenty.

Z textu dokumentu proveď v jednom kroku:
1. klasifikaci typu dokumentu,
2. určení lifecycleStatus a documentIntent,
3. extrakci všech nalezených důležitých polí do extractedFields,
4. stručná reviewWarnings jen když je skutečný problém,
5. suggestedActions jen když dávají praktický smysl pro poradce.

Pravidla:
- Vycházej pouze z textu dokumentu níže.
- Nevymýšlej hodnoty. Pokud si nejsi jistý, dej field status "missing" nebo pole vůbec neuváděj.
- U klíčových údajů smlouvy preferuj extractedFields jako např. insurer, productName, contractNumber, policyStartDate, investmentStrategy, premiumAmount, totalMonthlyPremium, fullName, birthDate, iban, variableSymbol.
- Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.
- documentClassification.reasons piš stručně česky.
- documentMeta.scannedVsDigital nastav na "digital", pokud text působí jako strojově čitelný PDF převod.
- suggestedActions mají být krátké a akční; payload nech jako objekt.

Soubor: ${fileName}

TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmedText}
<<<END_DOCUMENT_TEXT>>>`;
}

export async function runCombinedClassifyAndExtract(params: {
  documentText: string;
  sourceFileName?: string | null;
}): Promise<{ raw: string; envelope: DocumentReviewEnvelope }> {
  const response = await createResponseStructured<unknown>(
    buildCombinedClassifyAndExtractPrompt(params.documentText, params.sourceFileName),
    combinedClassifyAndExtractJsonSchema,
    {
      routing: { category: "ai_review" },
      schemaName: "document_review_envelope",
    }
  );

  const parsedObject =
    response.parsed && typeof response.parsed === "object" && !Array.isArray(response.parsed)
      ? (response.parsed as Record<string, unknown>)
      : {};
  const parsedMeta =
    parsedObject.documentMeta &&
    typeof parsedObject.documentMeta === "object" &&
    !Array.isArray(parsedObject.documentMeta)
      ? (parsedObject.documentMeta as Record<string, unknown>)
      : {};
  const parsed = documentReviewEnvelopeSchema.safeParse({
    ...parsedObject,
    documentMeta: {
      ...parsedMeta,
      ...(params.sourceFileName?.trim() ? { fileName: params.sourceFileName.trim() } : {}),
    },
  });
  if (!parsed.success) {
    throw new z.ZodError(parsed.error.issues);
  }
  return {
    raw: response.text,
    envelope: parsed.data,
  };
}
