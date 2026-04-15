import { describe, it, expect } from "vitest";
import { mapApiToExtractionDocument } from "../mappers";

describe("mapApiToExtractionDocument — Phase 1 DETAIL canonical fields", () => {
  it("exposes identityData from flat extractedFields for DETAIL panel", () => {
    const doc = mapApiToExtractionDocument(
      {
        id: "r1",
        fileName: "x.pdf",
        confidence: 0.9,
        processingStatus: "extracted",
        reviewStatus: "pending",
        detectedDocumentType: "life_insurance_final_contract",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fieldConfidenceMap: {},
        extractedPayload: {
          documentClassification: {
            primaryType: "life_insurance_final_contract",
            lifecycleStatus: "final_contract",
            documentIntent: "creates_new_product",
            confidence: 0.9,
            reasons: [],
          },
          documentMeta: { scannedVsDigital: "digital" },
          parties: {},
          reviewWarnings: [],
          extractedFields: {
            idCardNumber: { value: "OP999", status: "extracted" },
            idCardIssuedBy: { value: "Město Brno", status: "extracted" },
            idCardValidUntil: { value: "2031-06-04", status: "extracted" },
            generalPractitioner: { value: "MUDr. Test", status: "extracted" },
          },
        },
      },
      "",
    );
    expect(doc.canonicalFields?.identityData?.idCardNumber).toBe("OP999");
    expect(doc.canonicalFields?.identityData?.idCardIssuedBy).toBe("Město Brno");
    expect(doc.canonicalFields?.identityData?.generalPractitioner).toBe("MUDr. Test");
  });
});
