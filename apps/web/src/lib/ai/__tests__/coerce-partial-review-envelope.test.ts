import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "../document-classification";
import {
  mergePartialParsedIntoManualStub,
  parseJsonObjectFromAiReviewRaw,
  tryCoerceReviewEnvelopeAfterValidationFailure,
} from "../coerce-partial-review-envelope";
import { validateExtractionByType } from "../extraction-schemas-by-type";
import { buildManualReviewStubEnvelope } from "../ai-review-manual-stub";

const classification: ClassificationResult = {
  primaryType: "investment_service_agreement",
  subtype: "test",
  lifecycleStatus: "final_contract",
  documentIntent: "creates_new_product",
  confidence: 0.82,
  reasons: ["test_reason"],
};

describe("coerce-partial-review-envelope", () => {
  it("parseJsonObjectFromAiReviewRaw extracts object from markdown noise", () => {
    const raw = 'Předtext {"a":1,"documentClassification":{"primaryType":"life_insurance_contract"}}';
    const o = parseJsonObjectFromAiReviewRaw(raw);
    expect(o).not.toBeNull();
    expect((o as Record<string, unknown>).a).toBe(1);
  });

  it("coerce fills missing extractedField.status so Zod accepts envelope", () => {
    const raw = JSON.stringify({
      documentClassification: {
        primaryType: "investment_service_agreement",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.8,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {
        productName: { value: "Test produkt" },
        contractNumber: { value: "ABC-1", confidence: 0.9 },
      },
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    });
    const strict = validateExtractionByType(raw, "investment_service_agreement");
    expect(strict.ok).toBe(false);

    const parsed = parseJsonObjectFromAiReviewRaw(raw)!;
    const coerced = tryCoerceReviewEnvelopeAfterValidationFailure(
      parsed,
      "investment_service_agreement",
      classification
    );
    expect(coerced).not.toBeNull();
    expect(coerced!.extractedFields.productName?.status).toBe("inferred_low_confidence");
    expect(coerced!.extractedFields.contractNumber?.status).toBe("inferred_low_confidence");
  });

  it("salvages top-level extracted field aliases into the envelope", () => {
    const raw = JSON.stringify({
      documentClassification: {
        primaryType: "life_insurance_investment_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.8,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      insurer: "Generali Česká pojišťovna a.s.",
      productName: "Bel Mondo 20",
      contractNumber: "3282880076",
      policyStartDate: "1. 6. 2026",
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    });

    const parsed = parseJsonObjectFromAiReviewRaw(raw)!;
    const coerced = tryCoerceReviewEnvelopeAfterValidationFailure(
      parsed,
      "life_insurance_investment_contract",
      {
        ...classification,
        primaryType: "life_insurance_investment_contract",
      }
    );

    expect(coerced).not.toBeNull();
    expect(coerced!.extractedFields.insurer?.value).toBe("Generali Česká pojišťovna a.s.");
    expect(coerced!.extractedFields.productName?.value).toBe("Bel Mondo 20");
    expect(coerced!.extractedFields.contractNumber?.value).toBe("3282880076");
    expect(coerced!.extractedFields.policyStartDate?.value).toBe("1. 6. 2026");
  });

  it("merges top-level field candidates into manual-review stub fallback", () => {
    const parsed = {
      insurer: "Generali Česká pojišťovna a.s.",
      productName: "Bel Mondo 20",
      contractNumber: "3282880076",
      policyStartDate: "1. 6. 2026",
      parties: {
        policyholder: { fullName: "Hanna Havdan" },
      },
    };
    const stub = buildManualReviewStubEnvelope({
      classification: {
        ...classification,
        primaryType: "life_insurance_investment_contract",
      },
      inputMode: "text_pdf",
      extractionMode: "text",
      pageCount: 1,
      norm: "investment_contract",
      route: "contract_intake",
    });

    const result = mergePartialParsedIntoManualStub(stub, parsed, 512);

    expect(result.mergedFieldKeys).toEqual(
      expect.arrayContaining(["insurer", "productName", "contractNumber", "policyStartDate"])
    );
    expect(stub.extractedFields.contractNumber?.value).toBe("3282880076");
    expect(stub.parties.policyholder).toEqual({ fullName: "Hanna Havdan" });
  });
});
