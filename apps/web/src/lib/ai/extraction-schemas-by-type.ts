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

const FILE_BASED_FIELD_LABELS: Record<string, string> = {
  contractNumber: "Číslo smlouvy",
  proposalNumber: "Číslo návrhu",
  existingPolicyNumber: "Číslo pojistky",
  insurer: "Pojišťovna",
  institutionName: "Instituce",
  productName: "Název produktu",
  productType: "Typ produktu",
  policyStartDate: "Počátek pojištění",
  policyEndDate: "Konec pojištění",
  startDate: "Počátek smlouvy",
  endDate: "Konec smlouvy",
  policyDuration: "Doba pojištění",
  investmentStrategy: "Investiční strategie",
  totalMonthlyPremium: "Měsíční pojistné",
  annualPremium: "Roční pojistné",
  riskPremium: "Rizikové pojistné",
  investmentPremium: "Investiční pojistné",
  premiumAmount: "Pojistné",
  paymentFrequency: "Frekvence plateb",
  paymentAccountNumber: "Číslo účtu pro platbu",
  bankAccount: "Číslo účtu",
  bankCode: "Kód banky",
  documentStatus: "Stav dokumentu",
  fullName: "Jméno klienta",
  clientFullName: "Jméno klienta",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  address: "Adresa",
  phone: "Telefon",
  email: "E-mail",
  occupation: "Povolání",
  sports: "Sporty / rizikové aktivity",
  policyholder: "Pojistník",
  beneficiaries: "Oprávněné osoby",
  coverages: "Sjednaná rizika",
  riders: "Připojištění",
  insuredRisks: "Pojištěná rizika",
  insuredPersons: "Pojištěné osoby",
  deathBenefit: "Pojistná částka pro případ smrti",
  accidentBenefit: "Úrazové plnění",
  disabilityBenefit: "Plnění pro případ invalidity",
  hospitalizationBenefit: "Plnění za hospitalizaci",
  seriousIllnessBenefit: "Plnění za závažná onemocnění",
  loanAmount: "Výše úvěru",
  installmentAmount: "Splátka",
  interestRate: "Úroková sazba",
  iban: "IBAN",
  variableSymbol: "Variabilní symbol",
  constantSymbol: "Konstantní symbol",
  specificSymbol: "Specifický symbol",
  employer: "Zaměstnavatel",
  employerName: "Zaměstnavatel",
  netWage: "Čistá mzda",
  grossWage: "Hrubá mzda",
  investmentFunds: "Fondy",
  fundAllocation: "Alokace fondů",
  investmentAllocation: "Investiční alokace",
  investmentScenario: "Investiční scénář",
  platform: "Platforma",
  provider: "Poskytovatel",
  businessCaseNumber: "Číslo obchodního případu",
  intermediaryName: "Zprostředkovatel",
  intermediaryCode: "Kód zprostředkovatele",
  intermediaryCompany: "Společnost zprostředkovatele",
  dateSigned: "Datum sjednání",
  requiredDocuments: "Požadované dokumenty",
  modelationId: "Číslo modelace",
  modelPremium: "Modelované pojistné",
  insuredObject: "Předmět pojištění",
  insuredAddress: "Adresa pojištěného objektu",
};

function fieldKey(path: string): string {
  return path.replace(/^extractedFields\./, "").replace(/_if_present$/, "").replace(/_if_available$/, "").replace(/_or_\w+$/, "");
}

/**
 * Simplified extraction prompt for file-based PDF path (no text hint available).
 * Much shorter than buildSchemaPrompt — avoids overwhelming the model with nested structures
 * when it must read the PDF visually.
 */
export function buildFileBasedExtractionPrompt(documentType: ContractDocumentType): string {
  const definition = resolveDocumentSchema(documentType);
  const required = definition.extractionRules.required;
  const optional = definition.extractionRules.optional.slice(0, 8);

  const fieldLines = (paths: string[], prefix: string) =>
    paths.map((p) => {
      const key = fieldKey(p);
      const label = FILE_BASED_FIELD_LABELS[key] ?? key;
      return `  "${key}": { "value": "<${label}>", "status": "extracted", "confidence": 0.9 }`;
    }).join(",\n");

  const requiredExample = fieldLines(required, "");
  const optionalKeys = optional.map((p) => `"${fieldKey(p)}"`).join(", ");

  return `Jsi extrakční systém pro finanční dokumenty. Přečti přiložené PDF a extrahuj data.

POVINNÁ POLE (musí být vyplněna nebo status "missing"):
${required.map((p) => {
    const key = fieldKey(p);
    const label = FILE_BASED_FIELD_LABELS[key] ?? key;
    return `- ${key} = ${label}`;
  }).join("\n")}

VOLITELNÁ POLE (vyplň pokud nalezeno): ${optionalKeys}

Vrať POUZE platný JSON v přesně tomto formátu:
{
  "documentClassification": {
    "primaryType": "${documentType}",
    "lifecycleStatus": "final_contract",
    "documentIntent": "${definition.defaultIntent}",
    "confidence": 0.9,
    "reasons": ["popis z dokumentu"]
  },
  "documentMeta": {
    "issuer": "<název vydavatele>",
    "pageCount": <počet stran>,
    "scannedVsDigital": "digital"
  },
  "extractedFields": {
${requiredExample}
  },
  "parties": {},
  "reviewWarnings": [],
  "suggestedActions": []
}

Pro každé povinné pole, které NENAJDEŠ: použij status "missing" a value "".
Každé pole v extractedFields MUSÍ mít: value, status, confidence.
NEPIŠ žádný text mimo JSON. Žádné vysvětlení.`;
}

/**
 * Ultra-focused rescue prompt for a second pass when 0 required fields were found.
 * Returns flat JSON (not full envelope) — caller merges into extractedFields.
 */
export function buildRescueExtractionPrompt(documentType: ContractDocumentType): string {
  const definition = resolveDocumentSchema(documentType);
  const required = definition.extractionRules.required;

  const fieldPairs = required.map((p) => {
    const key = fieldKey(p);
    const label = FILE_BASED_FIELD_LABELS[key] ?? key;
    return `  "${key}": "<${label} nebo null>"`;
  }).join(",\n");

  return `Z přiloženého PDF extrahuj POUZE tyto údaje. Vrať POUZE JSON objekt, žádný jiný text:
{
${fieldPairs}
}
Pokud údaj v dokumentu nenajdeš, napiš null. Žádné vysvětlení, pouze JSON.`;
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
  const parsed = safeParseReviewEnvelope(raw, { expectedPrimaryType: documentType });
  if (!parsed.ok) return parsed;
  // Force classification fallback when model drifts type.
  if (parsed.data.documentClassification.primaryType !== documentType) {
    parsed.data.documentClassification.primaryType = documentType;
  }
  return { ok: true, data: parsed.data };
}
