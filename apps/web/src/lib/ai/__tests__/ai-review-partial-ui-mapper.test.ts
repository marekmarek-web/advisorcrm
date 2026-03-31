import { describe, expect, it } from "vitest";
import { hasMeaningfulReviewContent, mapApiToExtractionDocument } from "../../ai-review/mappers";
import type { ExtractionDocument } from "../../ai-review/types";

describe("mapApiToExtractionDocument partial / synthetic", () => {
  it("adds synthetic groups when envelope has empty extractedFields", () => {
    const detail = {
      id: "r1",
      fileName: "x.pdf",
      processingStatus: "review_required",
      reviewStatus: "pending",
      confidence: 0.35,
      extractedPayload: {
        documentClassification: {
          primaryType: "unsupported_or_unknown",
          subtype: "investment_service_agreement",
          lifecycleStatus: "unknown",
          documentIntent: "manual_review_required",
          confidence: 0.5,
          reasons: ["original_primary:investment_service_agreement"],
        },
        documentMeta: {
          scannedVsDigital: "digital",
          overallConfidence: 0.3,
          normalizedPipelineClassification: "onboarding_form",
          pipelineRoute: "contract_intake",
        },
        extractedFields: {},
        parties: {},
        reviewWarnings: [
          {
            code: "extraction_schema_validation",
            message: "Neplatný formát u documentMeta",
            severity: "warning" as const,
          },
        ],
        suggestedActions: [],
        contentFlags: {
          isFinalContract: false,
          isProposalOnly: false,
          containsPaymentInstructions: false,
          containsClientData: false,
          containsAdvisorData: false,
          containsMultipleDocumentSections: false,
        },
        sensitivityProfile: "standard_personal_data",
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
        evidence: [],
        productsOrObligations: [],
        financialTerms: {},
        serviceTerms: {},
      },
      extractionTrace: {
        aiClassifierJson: { documentType: "contract", productFamily: "investment" },
        normalizedPipelineClassification: "onboarding_form",
      },
      pipelineInsights: {
        normalizedPipelineClassification: "onboarding_form",
        extractionRoute: "contract_intake",
      },
      reasonsForReview: ["low_confidence"],
      detectedDocumentType: "investment_service_agreement",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.groups.length).toBeGreaterThan(0);
    expect(doc.reviewUiMeta?.usedSyntheticGroups).toBe(true);
    const names = doc.groups.map((g) => g.name).join(" ");
    expect(names).toContain("Rozpoznání");
    expect(names).toContain("Stav a kontrola");
    const values = doc.groups.flatMap((g) => g.fields).map((f) => f.value).join(" | ");
    expect(values).not.toContain("onboarding_form");
    expect(values).not.toContain("contract_intake");
    expect(values).toContain("AI si výsledkem není dost jistá");
  });

  it("hasMeaningfulReviewContent is true when trace has classifier despite empty groups", () => {
    const doc = {
      groups: [],
      advisorReview: undefined,
      reviewUiMeta: undefined,
      processingStatus: "review_required",
      extractionTrace: { aiClassifierJson: { documentType: "contract" } },
      pipelineInsights: undefined,
      documentType: "Neznámý typ",
    } as unknown as ExtractionDocument;
    expect(hasMeaningfulReviewContent(doc)).toBe(true);
  });

  it("hasMeaningfulReviewContent is false for bare uploaded state", () => {
    const doc = {
      groups: [],
      advisorReview: undefined,
      reviewUiMeta: undefined,
      processingStatus: "uploaded",
      extractionTrace: undefined,
      pipelineInsights: undefined,
      documentType: "Neznámý typ",
    } as unknown as ExtractionDocument;
    expect(hasMeaningfulReviewContent(doc)).toBe(false);
  });
});
