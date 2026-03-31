import { describe, expect, it } from "vitest";
import { resolveHybridInvestmentDocumentType } from "../ai-review-document-type-signals";
import type { ClassificationResult } from "../document-classification";
import type { DocumentReviewEnvelope } from "../document-review-types";

function envelopeWithFields(
  extractedFields: DocumentReviewEnvelope["extractedFields"]
): Pick<DocumentReviewEnvelope, "extractedFields"> {
  return { extractedFields };
}

const investmentModelationClassification: ClassificationResult = {
  primaryType: "life_insurance_modelation",
  subtype: "investment_life_insurance",
  lifecycleStatus: "modelation",
  documentIntent: "illustrative_only",
  confidence: 0.82,
  reasons: [],
};

describe("resolveHybridInvestmentDocumentType", () => {
  it("promotes investment modelation to contract when strong contract signals are present", () => {
    const resolved = resolveHybridInvestmentDocumentType(
      "life_insurance_modelation",
      envelopeWithFields({
        insurer: { value: "Generali", status: "extracted", confidence: 0.9 },
        productName: { value: "Bel Mondo 20", status: "extracted", confidence: 0.9 },
        contractNumber: { value: "3282880076", status: "extracted", confidence: 0.9 },
        policyStartDate: { value: "1. 6. 2026", status: "extracted", confidence: 0.9 },
      }),
      investmentModelationClassification
    );

    expect(resolved).toBe("life_insurance_investment_contract");
  });

  it("keeps modelation when only modelation signals are present", () => {
    const resolved = resolveHybridInvestmentDocumentType(
      "life_insurance_modelation",
      envelopeWithFields({
        insurer: { value: "Generali", status: "extracted", confidence: 0.9 },
        productName: { value: "Bel Mondo 20", status: "extracted", confidence: 0.9 },
        modelationId: { value: "MOD-001", status: "extracted", confidence: 0.9 },
      }),
      investmentModelationClassification
    );

    expect(resolved).toBe("life_insurance_modelation");
  });
});
