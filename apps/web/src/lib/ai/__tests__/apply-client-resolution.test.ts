import { describe, it, expect } from "vitest";
import { resolveApplyClientContactId } from "../apply-client-resolution";
import type { ContractReviewRow } from "../review-queue-repository";

function baseRow(
  patch: Partial<ContractReviewRow> & Pick<ContractReviewRow, "id" | "tenantId">,
): ContractReviewRow {
  return {
    fileName: "x.pdf",
    storagePath: "p",
    mimeType: "application/pdf",
    sizeBytes: 1,
    processingStatus: "extracted",
    processingStage: null,
    errorMessage: null,
    extractedPayload: {},
    clientMatchCandidates: [],
    draftActions: [],
    confidence: 0.9,
    reasonsForReview: null,
    reviewStatus: "approved",
    uploadedBy: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    appliedBy: null,
    appliedAt: null,
    matchedClientId: null,
    createNewClientConfirmed: null,
    applyResultPayload: null,
    reviewDecisionReason: null,
    inputMode: null,
    extractionMode: null,
    detectedDocumentType: null,
    detectedDocumentSubtype: null,
    lifecycleStatus: null,
    documentIntent: null,
    extractionTrace: null,
    validationWarnings: null,
    fieldConfidenceMap: null,
    classificationReasons: null,
    dataCompleteness: null,
    sensitivityProfile: null,
    sectionSensitivity: null,
    relationshipInference: null,
    originalExtractedPayload: null,
    correctedPayload: null,
    correctedFields: null,
    correctedDocumentType: null,
    correctedLifecycleStatus: null,
    fieldMarkedNotApplicable: null,
    linkedClientOverride: null,
    linkedDealOverride: null,
    confidenceOverride: null,
    ignoredWarnings: null,
    correctionReason: null,
    correctedBy: null,
    correctedAt: null,
    matchVerdict: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe("resolveApplyClientContactId", () => {
  it("prefers persisted matchVerdict column over trace when both differ (DB is source of truth)", () => {
    const row = baseRow({
      id: "r1",
      tenantId: "t1",
      matchVerdict: "existing_match",
      extractionTrace: { matchVerdict: "no_match" },
      matchedClientId: null,
      clientMatchCandidates: [{ clientId: "crm-1", score: 0.9, displayName: "A", reasons: [], confidence: "high" }],
    } as ContractReviewRow);
    const r = resolveApplyClientContactId(row);
    expect(r.matchVerdict).toBe("existing_match");
    expect(r.contactId).toBe("crm-1");
  });

  it("uses trace.autoResolvedClientId when column matchedClientId is null", () => {
    const row = baseRow({
      id: "r1",
      tenantId: "t1",
      matchVerdict: "existing_match",
      matchedClientId: null,
      clientMatchCandidates: [],
      extractionTrace: { matchVerdict: "existing_match", autoResolvedClientId: "auto-77" },
    } as ContractReviewRow);
    expect(resolveApplyClientContactId(row).contactId).toBe("auto-77");
  });

  it("does not let create-new UI block existing_match: still binds top candidate when present", () => {
    const row = baseRow({
      id: "r1",
      tenantId: "t1",
      matchVerdict: "near_match",
      matchedClientId: null,
      createNewClientConfirmed: "true",
      clientMatchCandidates: [{ clientId: "existing-aa", score: 0.32, displayName: "X", reasons: [], confidence: "medium" }],
      extractionTrace: { matchVerdict: "near_match" },
    } as ContractReviewRow);
    expect(resolveApplyClientContactId(row).contactId).toBe("existing-aa");
  });

  it("linkedClientOverride wins over matchedClientId", () => {
    const row = baseRow({
      id: "r1",
      tenantId: "t1",
      linkedClientOverride: "override-1",
      matchedClientId: "other",
      matchVerdict: "no_match",
    } as ContractReviewRow);
    expect(resolveApplyClientContactId(row).contactId).toBe("override-1");
  });
});
