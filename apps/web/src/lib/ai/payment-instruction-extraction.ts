/**
 * Dedicated extraction path for payment instruction documents (not full contract envelope).
 */

import { z } from "zod";
import { createResponseWithFile, createResponseStructuredWithImage } from "@/lib/openai";
import type { DocumentReviewEnvelope, ExtractedField, ReviewWarning } from "./document-review-types";
import { isOpenAIRateLimitError } from "./openai-rate-limit";

export const paymentInstructionExtractionSchema = z.object({
  institutionName: z.string().optional(),
  productName: z.string().optional(),
  payerName: z.string().optional(),
  beneficiaryName: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  paymentFrequency: z.string().optional(),
  dueDay: z.union([z.string(), z.number()]).optional(),
  dueDate: z.string().optional(),
  iban: z.string().optional(),
  accountNumber: z.string().optional(),
  bankCode: z.string().optional(),
  variableSymbol: z.string().optional(),
  constantSymbol: z.string().optional(),
  specificSymbol: z.string().optional(),
  reference: z.string().optional(),
  paymentNote: z.string().optional(),
  firstPaymentDate: z.string().optional(),
  paymentChannel: z.string().optional(),
  sourceDocumentType: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsHumanReview: z.boolean().optional(),
});

export type PaymentInstructionExtraction = z.infer<typeof paymentInstructionExtractionSchema>;

const PAYMENT_EXTRACTION_PROMPT = `Výpis platebních údajů z dokumentu. Výstup = jediný platný JSON, žádný markdown, žádné vysvětlení mimo JSON.

Pole (prázdné stringy pokud chybí):
institutionName, productName, payerName, beneficiaryName, amount (číslo nebo text), currency, paymentFrequency,
dueDay (den v měsíci), dueDate (datum), iban, accountNumber, bankCode, variableSymbol, constantSymbol, specificSymbol,
reference, paymentNote, firstPaymentDate, paymentChannel, sourceDocumentType,
confidence (0-1), needsHumanReview (boolean pokud jsou údaje nejasné nebo protichůdné).

Pravidla:
- IBAN a číslo účtu nikdy nehalucinuj; pokud nejsou čitelné, nech prázdné a needsHumanReview=true.
- Částku a měnu odvozuj jen z dokumentu.
- Krátké důvody dej do paymentNote pokud potřebuješ vysvětlit nejistotu.
- Všechny textové hodnoty (paymentNote apod.) piš VŽDY česky.`;

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function numStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return str(v);
}

/** Map dedicated extraction to CRM draft payload keys (apply-contract-review / client_payment_setups). */
export function mapPaymentExtractionToPortalDraftPayload(
  p: PaymentInstructionExtraction
): Record<string, string> {
  const amount = numStr(p.amount);
  return {
    obligationName: str(p.productName) || str(p.institutionName) || "Platba",
    paymentType: str(p.paymentFrequency) ? "regular" : "other",
    provider: str(p.institutionName),
    productName: str(p.productName),
    contractReference: str(p.reference),
    beneficiaryName: str(p.beneficiaryName),
    payerName: str(p.payerName),
    recipientAccount: str(p.accountNumber),
    iban: str(p.iban),
    bankCode: str(p.bankCode),
    variableSymbol: str(p.variableSymbol),
    specificSymbol: str(p.specificSymbol),
    constantSymbol: str(p.constantSymbol),
    regularAmount: amount,
    oneOffAmount: "",
    currency: str(p.currency) || "CZK",
    frequency: str(p.paymentFrequency),
    firstDueDate: str(p.firstPaymentDate) || str(p.dueDate),
    firstPaymentDate: str(p.firstPaymentDate) || str(p.dueDate),
    dueDayOfMonth: numStr(p.dueDay),
    clientNote: [str(p.paymentNote), str(p.paymentChannel) ? `Kanál: ${p.paymentChannel}` : ""]
      .filter(Boolean)
      .join(" | "),
  };
}

export function validatePaymentInstructionExtraction(
  p: PaymentInstructionExtraction
): { warnings: ReviewWarning[]; needsHumanReview: boolean } {
  const warnings: ReviewWarning[] = [];
  const hasIban = !!str(p.iban);
  const hasDomestic = !!str(p.accountNumber) && !!str(p.bankCode);
  if (!hasIban && !hasDomestic) {
    warnings.push({
      code: "payment_missing_account",
      message: "Chybí IBAN nebo číslo účtu s kódem banky — platbu nelze bezpečně zobrazit klientovi.",
      severity: "critical",
    });
  }
  if (!str(p.amount)) {
    warnings.push({
      code: "payment_amount_missing",
      message: "Nebyla spolehlivě rozpoznána částka.",
      severity: "warning",
    });
  }
  const nh =
    p.needsHumanReview === true ||
    warnings.some((w) => w.severity === "critical") ||
    (typeof p.confidence === "number" && p.confidence < 0.55);
  return { warnings, needsHumanReview: nh };
}

function field(
  value: string,
  confidence: number,
  status: "extracted" | "missing" | "not_found"
): ExtractedField {
  return {
    value: value || undefined,
    confidence,
    status,
  };
}

/** Build full envelope compatible with draft-actions buildPaymentSetupDraft + matching. */
export function buildPaymentInstructionEnvelope(params: {
  extraction: PaymentInstructionExtraction;
  primaryType: "payment_instruction" | "investment_payment_instruction";
  pageCount?: number;
  fileName?: string;
}): DocumentReviewEnvelope {
  const { extraction: p, primaryType, pageCount, fileName } = params;
  const conf = typeof p.confidence === "number" ? p.confidence : 0.65;
  const { warnings, needsHumanReview } = validatePaymentInstructionExtraction(p);
  const draftPayload = mapPaymentExtractionToPortalDraftPayload(p);

  const extractedFields: DocumentReviewEnvelope["extractedFields"] = {
    institutionName: field(str(p.institutionName), conf, str(p.institutionName) ? "extracted" : "missing"),
    productName: field(str(p.productName), conf, str(p.productName) ? "extracted" : "missing"),
    insurer: field(str(p.institutionName), conf, str(p.institutionName) ? "extracted" : "missing"),
    provider: field(str(p.institutionName), conf, str(p.institutionName) ? "extracted" : "missing"),
    platform: field(str(p.institutionName), conf, str(p.institutionName) ? "extracted" : "missing"),
    fullName: field(str(p.payerName), conf * 0.95, str(p.payerName) ? "extracted" : "missing"),
    clientFullName: field(str(p.payerName), conf * 0.95, str(p.payerName) ? "extracted" : "missing"),
    beneficiaryName: field(str(p.beneficiaryName), conf, str(p.beneficiaryName) ? "extracted" : "missing"),
    iban: field(str(p.iban), conf, str(p.iban) ? "extracted" : "missing"),
    accountNumber: field(str(p.accountNumber), conf, str(p.accountNumber) ? "extracted" : "missing"),
    bankCode: field(str(p.bankCode), conf, str(p.bankCode) ? "extracted" : "missing"),
    bankAccount: field(str(p.accountNumber), conf, str(p.accountNumber) ? "extracted" : "missing"),
    variableSymbol: field(str(p.variableSymbol), conf, str(p.variableSymbol) ? "extracted" : "missing"),
    specificSymbol: field(str(p.specificSymbol), conf, str(p.specificSymbol) ? "extracted" : "missing"),
    constantSymbol: field(str(p.constantSymbol), conf, str(p.constantSymbol) ? "extracted" : "missing"),
    contractReference: field(str(p.reference), conf, str(p.reference) ? "extracted" : "missing"),
    contractNumber: field(str(p.reference), conf, str(p.reference) ? "extracted" : "missing"),
    regularAmount: field(draftPayload.regularAmount, conf, draftPayload.regularAmount ? "extracted" : "missing"),
    currency: field(draftPayload.currency, conf, "extracted"),
    paymentFrequency: field(str(p.paymentFrequency), conf, str(p.paymentFrequency) ? "extracted" : "missing"),
    firstPaymentDate: field(draftPayload.firstDueDate, conf, draftPayload.firstDueDate ? "extracted" : "missing"),
    paymentPurpose: field(str(p.paymentNote), conf, str(p.paymentNote) ? "extracted" : "missing"),
    paymentType: field(str(p.paymentChannel), conf, str(p.paymentChannel) ? "extracted" : "missing"),
  };

  const allWarnings = [...warnings];
  if (needsHumanReview) {
    allWarnings.push({
      code: "payment_needs_human_review",
      message: "Platební údaje vyžadují kontrolu poradce před zobrazením klientovi.",
      severity: "warning",
    });
  }

  return {
    documentClassification: {
      primaryType,
      subtype: str(p.sourceDocumentType) || "payment_instruction_extracted",
      lifecycleStatus: "confirmation",
      documentIntent: "reference_only",
      confidence: conf,
      reasons: ["payment_instruction_dedicated_extraction"],
    },
    documentMeta: {
      fileName,
      pageCount,
      scannedVsDigital: "unknown",
      overallConfidence: conf,
      pipelineRoute: "payment_instructions",
      normalizedPipelineClassification: "payment_instructions",
      extractionRoute: "payment_instructions",
      textCoverageEstimate: conf,
    },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields,
    evidence: [],
    candidateMatches: {
      matchedClients: [],
      matchedHouseholds: [],
      matchedDeals: [],
      matchedCompanies: [],
      matchedContracts: [],
      score: 0,
      reason: "no_match",
      ambiguityFlags: [],
    },
    sectionSensitivity: {},
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    reviewWarnings: allWarnings,
    suggestedActions: [],
    sensitivityProfile: "financial_data",
    contentFlags: {
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: true,
      containsClientData: !!str(p.payerName),
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
    debug: {
      paymentInstructionExtraction: p,
    },
  };
}

export async function extractPaymentInstructionsFromDocument(
  fileUrl: string,
  _mimeType?: string | null
): Promise<
  | { ok: true; data: PaymentInstructionExtraction; raw: string }
  | { ok: false; error: string; errorCode?: string }
> {
  try {
    const raw = await createResponseWithFile(fileUrl, PAYMENT_EXTRACTION_PROMPT, {
      routing: { category: "ai_review" },
    });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(jsonStr) as unknown;
    const result = paymentInstructionExtractionSchema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: "Platební extrakce: neplatná struktura odpovědi modelu.",
      };
    }
    return { ok: true, data: result.data, raw: jsonStr.slice(0, 2000) };
  } catch (e) {
    if (isOpenAIRateLimitError(e)) {
      return {
        ok: false,
        error: "OpenAI rate limit při extrakci plateb.",
        errorCode: "OPENAI_RATE_LIMIT",
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * JSON schema for structured image extraction (OpenAI Responses API).
 * Uses string-only types for full compatibility with structured output.
 */
const PAYMENT_IMAGE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    institutionName: { type: "string" },
    productName: { type: "string" },
    amount: { type: "string" },
    currency: { type: "string" },
    paymentFrequency: { type: "string" },
    dueDay: { type: "string" },
    dueDate: { type: "string" },
    iban: { type: "string" },
    accountNumber: { type: "string" },
    bankCode: { type: "string" },
    variableSymbol: { type: "string" },
    constantSymbol: { type: "string" },
    specificSymbol: { type: "string" },
    paymentNote: { type: "string" },
    firstPaymentDate: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needsHumanReview: { type: "boolean" },
  },
  additionalProperties: false,
};

/**
 * Extracts payment instruction fields from a base64 image data URL
 * (or any URL accepted by OpenAI vision — data:image/... or https).
 * Used by the AI assistant drawer "payment from image" flow.
 */
export async function extractPaymentInstructionsFromImageUrl(
  imageUrl: string
): Promise<
  | { ok: true; data: PaymentInstructionExtraction; raw: string }
  | { ok: false; error: string; errorCode?: string }
> {
  try {
    const result = await createResponseStructuredWithImage<Record<string, unknown>>(
      imageUrl,
      PAYMENT_EXTRACTION_PROMPT,
      PAYMENT_IMAGE_JSON_SCHEMA,
      { routing: { category: "ai_review" }, schemaName: "payment_instruction_image" }
    );
    const raw = (result.text ?? JSON.stringify(result.parsed)).slice(0, 2000);
    const parsed = result.parsed;
    const zResult = paymentInstructionExtractionSchema.safeParse(parsed);
    if (!zResult.success) {
      return { ok: false, error: "Platební extrakce z obrázku: neplatná struktura odpovědi modelu." };
    }
    return { ok: true, data: zResult.data, raw };
  } catch (e) {
    if (isOpenAIRateLimitError(e)) {
      return { ok: false, error: "OpenAI rate limit při extrakci plateb z obrázku.", errorCode: "OPENAI_RATE_LIMIT" };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
