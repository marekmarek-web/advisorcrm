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

export type CombinedExtractionBundleHint = {
  isBundle: boolean;
  primarySubdocumentType?: string | null;
  candidateTypes?: string[];
  sectionHeadings?: string[];
  hasSensitiveAttachment?: boolean;
  hasInvestmentSection?: boolean;
};

/**
 * Pre-sliced section texts for bundle documents.
 * When available, the extraction prompt uses labeled sections instead of one anonymous blob,
 * reducing cross-section contamination.
 *
 * Each field is optional — populated only when the corresponding section was detected
 * and sliced from the document. Missing fields fall back to the main document text blob.
 */
export type BundleSectionTexts = {
  /** Text from contractual pages (final_contract or contract_proposal section). */
  contractualText?: string | null;
  /** Text from health questionnaire pages — must NOT be used as contractual fact source. */
  healthText?: string | null;
  /** Text from investment / DIP / DPS section pages. */
  investmentText?: string | null;
  /** Text from payment instruction section pages. */
  paymentText?: string | null;
  /** Text from attachment / AML / supporting section pages. */
  attachmentText?: string | null;
};

/**
 * Build the bundle-aware preamble for the combined extraction prompt.
 * Returns an empty string when there is no bundle hint.
 */
function buildBundleAwarePreamble(hint: CombinedExtractionBundleHint): string {
  if (!hint.isBundle) return "";

  const sectionTypeLabels: Record<string, string> = {
    final_contract: "finální smlouva",
    contract_proposal: "návrh smlouvy",
    modelation: "modelace",
    health_questionnaire: "zdravotní dotazník",
    aml_fatca_form: "AML/FATCA formulář",
    payment_instruction: "platební instrukce",
    investment_section: "investiční sekce / DIP / DPS",
    service_document: "servisní dokument",
    annex: "příloha",
  };

  const candidateList =
    (hint.candidateTypes ?? [])
      .map((t) => sectionTypeLabels[t] ?? t)
      .join(", ") || "více sekcí";

  const headingLines =
    (hint.sectionHeadings ?? []).length > 0
      ? `Detekované nadpisy sekcí: ${hint.sectionHeadings!.slice(0, 4).join(" | ")}\n`
      : "";

  const sensitiveNote = hint.hasSensitiveAttachment
    ? "POZOR: Dokument obsahuje citlivou přílohu (zdravotní dotazník nebo AML formulář) — tato data nepatří do smluvní extrakce.\n"
    : "";

  const investmentNote = hint.hasInvestmentSection
    ? "POZOR: Dokument obsahuje investiční sekci (DIP/DPS/fond) — extrahuj investmentStrategy, investmentFunds a investmentPremium z smluvní/investiční části, ne z modelací.\n"
    : "";

  return `BUNDLE DOKUMENT — více logických sekcí:
Detekované typy: ${candidateList}
Primární sekce: ${hint.primarySubdocumentType ? (sectionTypeLabels[hint.primarySubdocumentType] ?? hint.primarySubdocumentType) : "neznámá"}
${headingLines}${sensitiveNote}${investmentNote}
Pravidla pro bundle:
- Klasifikuj dokument podle PRIMÁRNÍ sekce (finální smlouva > návrh > modelace).
- Extrahuj contract fields POUZE z finální smlouvy nebo návrhu, NE ze zdravotního dotazníku nebo AML.
- lifecycleStatus urči podle primární sekce.
- contentFlags.containsMultipleDocumentSections nastav na true.

`;
}

/** Max chars per section slice in the bundle-context prompt (keeps total tokens in check). */
const SECTION_MAX_CHARS = 18_000;

/**
 * Format section-aware document text block.
 *
 * When `sectionTexts` provides non-trivial sections, emits explicitly labeled sections
 * so the model can attribute facts to the correct subdocument.
 * Falls back to a single anonymous blob when sections aren't available.
 */
function buildSectionAwareDocumentBlock(
  fullText: string,
  sectionTexts?: BundleSectionTexts | null,
): string {
  const trimmed = fullText.trim();

  if (!sectionTexts) {
    return `TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmed}
<<<END_DOCUMENT_TEXT>>>`;
  }

  const sections: string[] = [];

  const cap = (t: string) =>
    t.length > SECTION_MAX_CHARS ? t.slice(0, SECTION_MAX_CHARS) + "\n…[zkráceno]" : t;

  if (sectionTexts.contractualText?.trim()) {
    sections.push(`[SMLUVNÍ ČÁST — finální smlouva nebo návrh smlouvy]
${cap(sectionTexts.contractualText.trim())}`);
  }

  if (sectionTexts.healthText?.trim()) {
    sections.push(`[ZDRAVOTNÍ DOTAZNÍK — POUZE pro zdravotní prohlášení, NEPOUŽÍVEJ jako zdroj contractual facts]
${cap(sectionTexts.healthText.trim())}`);
  }

  if (sectionTexts.investmentText?.trim()) {
    sections.push(`[INVESTIČNÍ SEKCE — DIP / DPS / fondy / investiční strategie]
${cap(sectionTexts.investmentText.trim())}`);
  }

  if (sectionTexts.paymentText?.trim()) {
    sections.push(`[PLATEBNÍ SEKCE — platební instrukce / účet / variabilní symbol]
${cap(sectionTexts.paymentText.trim())}`);
  }

  if (sectionTexts.attachmentText?.trim()) {
    sections.push(`[PŘÍLOHA / AML / DOPROVODNÝ DOKUMENT — NEPOUŽÍVEJ jako zdroj smluvních dat]
${cap(sectionTexts.attachmentText.trim())}`);
  }

  if (sections.length === 0) {
    // All sections empty — fall back to full text blob
    return `TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmed}
<<<END_DOCUMENT_TEXT>>>`;
  }

  // Provide full text after sections as fallback context
  const fullBlob = trimmed.length > 0
    ? `\n[CELÝ TEXT DOKUMENTU — jako záložní kontext]\n${trimmed.length > SECTION_MAX_CHARS * 2 ? trimmed.slice(0, SECTION_MAX_CHARS * 2) + "\n…[zkráceno]" : trimmed}`
    : "";

  return `SEKCE DOKUMENTU (každá část je oddělená logická sekce):
${sections.map((s, i) => `--- SEKCE ${i + 1} ---\n${s}`).join("\n\n")}
${fullBlob}`;
}

/**
 * Section-specific extraction rules appended when section texts are available.
 * Instructs the model to prefer each section's content for the matching field type.
 */
function buildSectionSpecificRules(sectionTexts?: BundleSectionTexts | null): string {
  if (!sectionTexts) return "";

  const rules: string[] = [];

  if (sectionTexts.contractualText?.trim()) {
    rules.push("- contractNumber, insurer, productName, policyStartDate, policyEndDate, totalMonthlyPremium — taháš PRIMÁRNĚ ze SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.healthText?.trim()) {
    rules.push("- ZDRAVOTNÍ DOTAZNÍK slouží POUZE jako signál sectionSensitivity.health_section='health_data'. NEEXTRAHUJ z něj contractual facts (jméno pojistníka, pojistné, rizika) pokud nejsou explicitně potvrzené ve SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.investmentText?.trim()) {
    rules.push("- investmentStrategy, investmentFunds, fundAllocation, investmentPremium — taháš PRIMÁRNĚ z INVESTIČNÍ SEKCE.");
  }
  if (sectionTexts.paymentText?.trim()) {
    rules.push("- bankAccount, variableSymbol, iban, paymentFrequency — taháš PRIMÁRNĚ z PLATEBNÍ SEKCE nebo SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.attachmentText?.trim()) {
    rules.push("- PŘÍLOHA / AML / DOPROVODNÝ DOKUMENT: tato část nesmí přepsat smluvní fakta. Nastav sensitiveAttachmentOnly=true pokud je to jediná přítomná sekce.");
  }

  return rules.length > 0
    ? `\nPRAVIDLA PRO SEKCE:\n${rules.join("\n")}\n`
    : "";
}

export function buildCombinedClassifyAndExtractPrompt(
  documentText: string,
  sourceFileName?: string | null,
  bundleHint?: CombinedExtractionBundleHint | null,
  sectionTexts?: BundleSectionTexts | null,
): string {
  const trimmedText = documentText.trim();
  const fileName = sourceFileName?.trim() || "unknown";
  const bundlePreamble = bundleHint?.isBundle ? buildBundleAwarePreamble(bundleHint) : "";
  const sectionRules = buildSectionSpecificRules(sectionTexts);
  const documentBlock = buildSectionAwareDocumentBlock(trimmedText, sectionTexts);

  return `Jsi extrakční systém pro finanční dokumenty.
${bundlePreamble}

Z textu dokumentu proveď v jednom kroku:
1. klasifikaci typu dokumentu,
2. určení lifecycleStatus a documentIntent,
3. extrakci všech nalezených důležitých polí do extractedFields,
4. stručná reviewWarnings jen když je skutečný problém,
5. suggestedActions jen když dávají praktický smysl pro poradce.

Pravidla:
- Vycházej pouze z textu dokumentu níže.
- Nevymýšlej hodnoty. Pokud si nejsi jistý, dej field status "missing" nebo pole vůbec neuváděj.
- Extrahuj co nejvíce praktických údajů pro finančního poradce a CRM.
- Preferované kategorie v extractedFields:
  - Klient: fullName, birthDate, personalId, address, permanentAddress, phone, email, occupation, sports.
  - Smlouva: contractNumber, proposalNumber, insurer, productName, productType, documentStatus, policyStartDate, policyEndDate, policyDuration, dateSigned, businessCaseNumber.
  - Rizika a připojištění: coverages, riders, insuredRisks, insuredPersons, deathBenefit, accidentBenefit, disabilityBenefit, hospitalizationBenefit, seriousIllnessBenefit.
  - Platby: totalMonthlyPremium, annualPremium, riskPremium, investmentPremium, paymentFrequency, paymentAccountNumber, bankAccount, iban, variableSymbol, bankCode, firstPaymentDate, paymentPurpose.
  - Zprostředkovatel: intermediaryName, intermediaryCode, intermediaryCompany, advisorName, brokerName.
  - Investice: investmentStrategy, investmentFunds, fundAllocation, investmentAllocation, investmentScenario.
  - Oprávněné osoby: beneficiaries.
- MULTI-PERSON: Pokud dokument obsahuje více osob (pojistník ≠ pojištěný, děti, spoludlužník), extrahuj každou osobu zvlášť do parties jako { role, fullName, birthDate, personalId?, address?, email?, phone?, occupation? }. Role: "policyholder", "insured", "legal_representative", "beneficiary", "child_insured", "co_applicant".
- MULTI-RISK: Pro každé sjednané riziko/připojištění vyplň insuredPersons a coverages jako JSON string pole prvků [{ person, riskType, riskLabel, insuredAmount, termEnd?, premium? }].
- INVESTICE: Extrahuj investmentStrategy (string), investmentFunds jako JSON string [{ name, allocation }], investmentPremium. U modelace napiš lifecycleStatus = "modelation" nebo "non_binding_projection".
- PLATBY: bankAccount, variableSymbol, iban, bankCode, paymentFrequency extrahuj vždy, pokud jsou v dokumentu. Neodhaduj — pouze hodnoty z textu.
- BUNDLE: Pokud dokument obsahuje více logických sekcí (smlouva + zdravotní dotazník / AML / platební instrukce), nastav contentFlags.containsMultipleDocumentSections = true a přidej reviewWarning s kódem "multi_section_bundle_detected".
- ZDRAVOTNÍ SEKCE: Pokud je přítomný zdravotní dotazník nebo zdravotní prohlášení, nastav sectionSensitivity.health_section = "health_data".
- U modelací nebo návrhů extrahuj maximum čitelných údajů.
- Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.
- documentClassification.reasons piš stručně česky.
- documentMeta.scannedVsDigital nastav na "digital", pokud text působí jako strojově čitelný PDF převod.
- suggestedActions mají být krátké a akční; payload nech jako objekt.
${sectionRules}
Soubor: ${fileName}

${documentBlock}`;
}

export async function runCombinedClassifyAndExtract(params: {
  documentText: string;
  sourceFileName?: string | null;
  bundleHint?: CombinedExtractionBundleHint | null;
  /** Pre-sliced section texts for bundle-context enrichment. Reduces cross-section contamination. */
  sectionTexts?: BundleSectionTexts | null;
}): Promise<{ raw: string; envelope: DocumentReviewEnvelope }> {
  const response = await createResponseStructured<unknown>(
    buildCombinedClassifyAndExtractPrompt(params.documentText, params.sourceFileName, params.bundleHint, params.sectionTexts),
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
