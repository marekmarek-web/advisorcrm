import { z } from "zod";
import { createResponseWithFile } from "@/lib/openai";
import {
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
  type DocumentClassification,
} from "./document-review-types";
import {
  classifyIntentFromClassification,
  classifyLifecycleFromPrimary,
} from "./document-schema-registry";

export type ClassificationResult = DocumentClassification;
export type ContractDocumentType = (typeof PRIMARY_DOCUMENT_TYPES)[number];
export const CONTRACT_DOCUMENT_TYPES = PRIMARY_DOCUMENT_TYPES;

const classificationResponseSchema = z.object({
  primaryType: z.enum(PRIMARY_DOCUMENT_TYPES),
  subtype: z.string().min(1).max(120).optional(),
  lifecycleStatus: z.enum(DOCUMENT_LIFECYCLE_STATUSES).optional(),
  documentIntent: z.enum(DOCUMENT_INTENTS).optional(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().max(120)).max(3).optional(),
});

const CLASSIFICATION_PROMPT = `Urči typ finančního dokumentu. Výstup = jediný platný JSON. Žádný markdown, žádný text mimo JSON.

Povinné:
- primaryType: jedna z ${PRIMARY_DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}
- subtype: instituce/produkt hint nebo "unknown"
- confidence: 0–1

Volitelné (jen pokud jsi jistý): lifecycleStatus z ${DOCUMENT_LIFECYCLE_STATUSES.map((t) => `"${t}"`).join(", ")}, documentIntent z ${DOCUMENT_INTENTS.map((t) => `"${t}"`).join(", ")}
- reasons: max 3 krátké české tagy; jinak vynech nebo []

Rozhoduj podle nadpisů a klíčových frází. Nikdy neoznač návrh jako final_contract bez důkazu.`;

export function normalizeClassification(raw: Partial<ClassificationResult>): ClassificationResult {
  const primaryType = (raw.primaryType ?? "unsupported_or_unknown") as ContractDocumentType;
  const lifecycleStatus = classifyLifecycleFromPrimary(primaryType, raw.lifecycleStatus);
  return {
    primaryType,
    subtype: raw.subtype?.trim() || "unknown",
    lifecycleStatus,
    documentIntent:
      raw.documentIntent ??
      classifyIntentFromClassification({
        primaryType,
        lifecycleStatus,
      }),
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0,
    reasons: Array.isArray(raw.reasons) && raw.reasons.length ? raw.reasons : [],
  };
}

/** Exported for unit tests. */
export function parseClassificationResponse(raw: string): ClassificationResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  // Backward compatibility for older prompts/tests.
  const aliasMap: Record<string, ContractDocumentType> = {
    life_insurance_final_contract: "life_insurance_final_contract",
    insurance_contract: "life_insurance_contract",
    life_insurance_change_request: "life_insurance_change_request",
    life_insurance_modelation: "life_insurance_modelation",
    payslip_document: "payslip_document",
    income_proof_document: "income_proof_document",
    corporate_tax_return: "corporate_tax_return",
    self_employed_tax_or_income_document: "self_employed_tax_or_income_document",
    insurance_policy_change_or_service_doc: "insurance_policy_change_or_service_doc",
    investment_contract: "investment_service_agreement",
    loan_or_mortgage_contract: "consumer_loan_contract",
    amendment: "generic_financial_document",
    application_or_proposal: "life_insurance_proposal",
    payment_document: "bank_statement",
    terms_and_conditions: "service_agreement",
    unknown: "unsupported_or_unknown",
  };
  const upgraded = {
    ...parsed,
    primaryType:
      typeof parsed.primaryType === "string"
        ? parsed.primaryType
        : typeof parsed.documentType === "string"
          ? parsed.documentType
          : "unsupported_or_unknown",
  };
  if (typeof upgraded.primaryType === "string" && aliasMap[upgraded.primaryType]) {
    upgraded.primaryType = aliasMap[upgraded.primaryType];
  }
  const result = classificationResponseSchema.safeParse(upgraded);
  if (!result.success) {
    return normalizeClassification({
      primaryType: "unsupported_or_unknown",
      confidence: 0,
      reasons: ["Chyba parsování: " + result.error.message],
      subtype: "unknown",
      lifecycleStatus: "unknown",
    });
  }
  const norm = normalizeClassification({
    ...result.data,
    reasons: result.data.reasons?.length ? result.data.reasons : [],
  });
  return norm;
}

export async function classifyContractDocument(
  fileUrl: string
): Promise<ClassificationResult> {
  const raw = await createResponseWithFile(fileUrl, CLASSIFICATION_PROMPT, {
    routing: { category: "ai_review" },
  });
  return parseClassificationResponse(raw);
}
