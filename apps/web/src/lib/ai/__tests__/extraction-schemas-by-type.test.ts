import { describe, it, expect } from "vitest";
import {
  getSchemaForDocumentType,
  validateExtractionByType,
  buildExtractionPrompt,
  wrapExtractionPromptWithDocumentText,
  selectExcerptForExtraction,
  EXTRACTION_DOCUMENT_TEXT_MAX_CHARS,
  SECTION_CONFIDENCE_KEYS,
} from "../extraction-schemas-by-type";
import type { ContractDocumentType } from "../document-classification";

const DOC_TYPES: ContractDocumentType[] = [
  "life_insurance_contract",
  "investment_service_agreement",
  "consumer_loan_contract",
  "generic_financial_document",
  "life_insurance_proposal",
  "bank_statement",
  "service_agreement",
  "unsupported_or_unknown",
];

describe("extraction-schemas-by-type", () => {
  describe("getSchemaForDocumentType", () => {
    it("returns schema and prompt fragment for each document type", () => {
      for (const docType of DOC_TYPES) {
        const info = getSchemaForDocumentType(docType);
        expect(info.schema).toBeDefined();
        expect(typeof info.promptFragment).toBe("string");
        expect(info.promptFragment.length).toBeGreaterThan(0);
      }
    });

    it("life_insurance_contract fragment includes review hints", () => {
      const info = getSchemaForDocumentType("life_insurance_contract");
      expect(info.promptFragment.toLowerCase()).toMatch(/proposal|nesjednano|broker/);
    });

    it("consumer_loan_contract fragment includes collateral rule", () => {
      const info = getSchemaForDocumentType("consumer_loan_contract");
      expect(info.promptFragment.toLowerCase()).toMatch(/collateral|missing|not_applicable/);
    });
  });

  describe("validateExtractionByType", () => {
    it("accepts valid minimal payload", () => {
      const raw = JSON.stringify({
        documentClassification: {
          primaryType: "life_insurance_contract",
          subtype: "generali_bel_mondo",
          lifecycleStatus: "final_contract",
          confidence: 0.8,
        },
        documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.8 },
        parties: {},
        productsOrObligations: [],
        financialTerms: {},
        serviceTerms: {},
        extractedFields: {
          insurer: { value: "Generali", confidence: 0.9, sourcePage: 1, evidenceSnippet: "Generali", status: "extracted" },
        },
        evidence: [],
        candidateMatches: {
          matchedClients: [],
          matchedHouseholds: [],
          matchedDeals: [],
          score: 0,
          reason: "no_match",
          ambiguityFlags: [],
        },
        reviewWarnings: [],
        suggestedActions: [],
        sensitivityProfile: "financial_data",
      });
      const result = validateExtractionByType(raw, "life_insurance_contract");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.documentClassification.primaryType).toBe("life_insurance_contract");
        expect(result.data.extractedFields.insurer?.value).toBe("Generali");
      }
    });

    it("forces classification primaryType from router type", () => {
      const raw = JSON.stringify({
        documentClassification: {
          primaryType: "bank_statement",
          lifecycleStatus: "statement",
          confidence: 0.9,
        },
        documentMeta: { scannedVsDigital: "digital" },
        parties: {},
        productsOrObligations: [],
        financialTerms: {},
        serviceTerms: {},
        extractedFields: {},
        evidence: [],
        candidateMatches: {
          matchedClients: [],
          matchedHouseholds: [],
          matchedDeals: [],
          score: 0,
          reason: "no_match",
          ambiguityFlags: [],
        },
        reviewWarnings: [],
        suggestedActions: [],
        sensitivityProfile: "financial_data",
      });
      const result = validateExtractionByType(raw, "consumer_loan_contract");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.documentClassification.primaryType).toBe("consumer_loan_contract");
      }
    });

    it("rejects invalid JSON", () => {
      const result = validateExtractionByType("not json at all", "unsupported_or_unknown");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe("buildExtractionPrompt", () => {
    it("includes base and type-specific fragment", () => {
      const prompt = buildExtractionPrompt("life_insurance_contract", false);
      expect(prompt).toContain("JSON");
      expect(prompt).toContain("DocumentReviewEnvelope");
      expect(prompt).toMatch(/extractedFields|explicitly_not_selected|not_applicable/i);
    });

    it("includes scan hint when isScanFallback is true", () => {
      const promptScan = buildExtractionPrompt("unsupported_or_unknown", true);
      const promptText = buildExtractionPrompt("unsupported_or_unknown", false);
      expect(promptScan).toMatch(/scan|nasken|inferred_low_confidence/i);
      expect(promptScan.length).toBeGreaterThan(promptText.length);
    });
  });

  describe("wrapExtractionPromptWithDocumentText", () => {
    it("embeds markdown body between delimiters", () => {
      const out = wrapExtractionPromptWithDocumentText("DO EXTRACT JSON", "## Page 1\nFoo bar");
      expect(out).toContain("DO EXTRACT JSON");
      expect(out).toContain("<<<DOCUMENT_TEXT>>>");
      expect(out).toContain("<<<END_DOCUMENT_TEXT>>>");
      expect(out).toContain("Foo bar");
    });
  });

  describe("selectExcerptForExtraction", () => {
    it("returns full text when under max", () => {
      const { text, truncated } = selectExcerptForExtraction("abc".repeat(100));
      expect(truncated).toBe(false);
      expect(text.length).toBe(300);
    });

    it("truncates long markdown with marker", () => {
      const long = "x".repeat(EXTRACTION_DOCUMENT_TEXT_MAX_CHARS + 5000);
      const { text, truncated } = selectExcerptForExtraction(long);
      expect(truncated).toBe(true);
      expect(text.length).toBeLessThanOrEqual(EXTRACTION_DOCUMENT_TEXT_MAX_CHARS + 400);
      expect(text).toMatch(/zkrácen|vynechán/);
    });
  });

  describe("SECTION_CONFIDENCE_KEYS", () => {
    it("includes expected sections", () => {
      expect(SECTION_CONFIDENCE_KEYS).toContain("contract");
      expect(SECTION_CONFIDENCE_KEYS).toContain("client");
      expect(SECTION_CONFIDENCE_KEYS).toContain("paymentDetails");
      expect(SECTION_CONFIDENCE_KEYS).toContain("dates");
    });
  });
});
