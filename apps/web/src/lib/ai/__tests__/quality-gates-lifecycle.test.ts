import { describe, it, expect } from "vitest";
import { evaluateApplyReadiness } from "../quality-gates";
import type { ContractReviewRow } from "../review-queue-repository";

function minimalRow(overrides: Partial<ContractReviewRow> = {}): ContractReviewRow {
  return {
    id: "r1",
    tenantId: "t1",
    fileName: "x.pdf",
    storagePath: "p",
    mimeType: "application/pdf",
    sizeBytes: 1,
    processingStatus: "ready",
    processingStage: null,
    errorMessage: null,
    extractedPayload: {},
    clientMatchCandidates: [],
    draftActions: [],
    confidence: 0.9,
    reasonsForReview: null,
    inputMode: null,
    extractionMode: null,
    detectedDocumentType: "life_insurance_contract",
    detectedDocumentSubtype: null,
    lifecycleStatus: null,
    documentIntent: null,
    extractionTrace: {
      classificationConfidence: 0.9,
      normalizedPipelineClassification: "insurance_contract",
    },
    validationWarnings: null,
    fieldConfidenceMap: undefined,
    classificationReasons: null,
    dataCompleteness: null,
    sensitivityProfile: null,
    sectionSensitivity: null,
    relationshipInference: null,
    reviewStatus: "approved",
    matchedClientId: "c1",
    createNewClientConfirmed: null,
    applyResultPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    appliedBy: null,
    appliedAt: null,
    ...overrides,
  } as ContractReviewRow;
}

describe("evaluateApplyReadiness lifecycle guard", () => {
  it("blocks apply when envelope lifecycle is proposal", () => {
    const row = minimalRow({
      extractedPayload: {
        documentClassification: { lifecycleStatus: "proposal" },
      },
    });
    const g = evaluateApplyReadiness(row);
    expect(g.blockedReasons).toContain("NON_FINAL_LIFECYCLE");
  });

  it("blocks when LLM client match is ambiguous", () => {
    const row = minimalRow({
      extractionTrace: {
        classificationConfidence: 0.9,
        normalizedPipelineClassification: "insurance_contract",
        llmClientMatchKind: "ambiguous",
      },
    });
    const g = evaluateApplyReadiness(row);
    expect(g.blockedReasons).toContain("LLM_CLIENT_MATCH_AMBIGUOUS");
  });
});
