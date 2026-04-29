import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptCorrectionEventsForReview: vi.fn(),
  createEvalCaseFromCorrections: vi.fn(),
  listCorrectionEventsForReview: vi.fn(),
  buildAiReviewLearningPatterns: vi.fn(),
}));

vi.mock("../ai-review-learning-repository", () => ({
  acceptCorrectionEventsForReview: mocks.acceptCorrectionEventsForReview,
  createEvalCaseFromCorrections: mocks.createEvalCaseFromCorrections,
  listCorrectionEventsForReview: mocks.listCorrectionEventsForReview,
}));

vi.mock("../ai-review-learning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai-review-learning")>();
  return {
    ...actual,
    buildAiReviewLearningPatterns: mocks.buildAiReviewLearningPatterns,
  };
});

import { handleAiReviewApprovalLearning } from "../ai-review-approval-learning";

const tenantId = "33333333-3333-4333-8333-333333333333";
const reviewId = "22222222-2222-4222-8222-222222222222";
const acceptedAt = new Date("2026-04-29T14:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acceptCorrectionEventsForReview.mockResolvedValue([]);
  mocks.listCorrectionEventsForReview.mockResolvedValue([]);
  mocks.createEvalCaseFromCorrections.mockResolvedValue("66666666-6666-4666-8666-666666666666");
  mocks.buildAiReviewLearningPatterns.mockResolvedValue([]);
});

describe("AI Review approval learning hook", () => {
  it("approves without corrections and keeps learning work skipped", async () => {
    const summary = await handleAiReviewApprovalLearning({
      tenantId,
      reviewId,
      acceptedAt,
      expectedOutputJson: {},
    });

    expect(mocks.acceptCorrectionEventsForReview).toHaveBeenCalledWith({ tenantId, reviewId, acceptedAt });
    expect(mocks.listCorrectionEventsForReview).not.toHaveBeenCalled();
    expect(mocks.buildAiReviewLearningPatterns).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      acceptedCorrectionIds: [],
      createdEvalCaseIds: [],
      patternRebuildStatus: "skipped_no_corrections",
    });
  });

  it("accepts existing corrections and rebuilds learning patterns", async () => {
    mocks.acceptCorrectionEventsForReview.mockResolvedValue(["c1"]);
    mocks.listCorrectionEventsForReview.mockResolvedValue([{
      id: "c1",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      fieldPath: "extractedFields.contractNumber",
    }]);
    mocks.buildAiReviewLearningPatterns.mockResolvedValue([{ patternType: "extraction_hint" }]);

    const summary = await handleAiReviewApprovalLearning({
      tenantId,
      reviewId,
      acceptedAt,
      expectedOutputJson: { contractNumber: "ABC" },
    });

    expect(summary.acceptedCorrectionIds).toEqual(["c1"]);
    expect(mocks.buildAiReviewLearningPatterns).toHaveBeenCalledWith({
      tenantId,
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
    });
    expect(summary.patternRebuildStatus).toBe("ok");
  });

  it("creates eval case draft for critical premium correction", async () => {
    mocks.acceptCorrectionEventsForReview.mockResolvedValue(["c-premium"]);
    mocks.listCorrectionEventsForReview.mockResolvedValue([{
      id: "c-premium",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      fieldPath: "premium.totalMonthlyPremium",
    }]);
    mocks.createEvalCaseFromCorrections.mockResolvedValue("eval-1");

    const expectedOutputJson = { premium: { totalMonthlyPremium: 2442 } };
    const summary = await handleAiReviewApprovalLearning({
      tenantId,
      reviewId,
      acceptedAt,
      expectedOutputJson,
    });

    expect(mocks.createEvalCaseFromCorrections).toHaveBeenCalledWith({
      tenantId,
      reviewId,
      correctionIds: ["c-premium"],
      piiScrubbed: false,
    });
    expect(summary.createdEvalCaseIds).toEqual(["eval-1"]);
  });

  it("does not fail approval when pattern rebuild fails", async () => {
    mocks.acceptCorrectionEventsForReview.mockResolvedValue(["c1"]);
    mocks.listCorrectionEventsForReview.mockResolvedValue([{
      id: "c1",
      institutionName: null,
      productName: null,
      documentType: "life_insurance_contract",
      fieldPath: "extractedFields.someOptionalField",
    }]);
    mocks.buildAiReviewLearningPatterns.mockRejectedValue(new Error("pattern mining unavailable"));

    await expect(handleAiReviewApprovalLearning({
      tenantId,
      reviewId,
      acceptedAt,
      expectedOutputJson: {},
    })).resolves.toMatchObject({
      acceptedCorrectionIds: ["c1"],
      createdEvalCaseIds: [],
      patternRebuildStatus: "failed",
    });
  });
});
