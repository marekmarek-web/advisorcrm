import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "../document-classification";
import {
  parseJsonObjectFromAiReviewRaw,
  tryCoerceReviewEnvelopeAfterValidationFailure,
} from "../coerce-partial-review-envelope";
import { validateExtractionByType } from "../extraction-schemas-by-type";

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
});
