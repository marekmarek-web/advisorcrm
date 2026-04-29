import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantId = "33333333-3333-4333-8333-333333333333";
const reviewId = "22222222-2222-4222-8222-222222222222";
const correctionId = "11111111-1111-4111-8111-111111111111";
const userId = "44444444-4444-4444-8444-444444444444";

const txState = {
  selectRows: [] as unknown[],
  selectQueue: [] as unknown[][],
  returningRows: [] as unknown[],
  inserted: [] as unknown[],
  updated: [] as unknown[],
};

function nextSelectRows(): unknown[] {
  return txState.selectQueue.shift() ?? txState.selectRows;
}

function selectChain() {
  const terminal = {
    orderBy: () => ({ limit: async () => nextSelectRows() }),
    limit: async () => nextSelectRows(),
    then: (resolve: (value: unknown[]) => void) => resolve(nextSelectRows()),
  };
  return {
    from: () => ({
      where: () => terminal,
      orderBy: () => ({ limit: async () => txState.selectRows }),
      limit: async () => txState.selectRows,
    }),
  };
}

vi.mock("@/lib/db/service-db", () => ({
  withServiceTenantContext: async (
    _options: unknown,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const tx = {
      insert: () => ({
        values: (values: unknown) => {
          txState.inserted.push(values);
          return {
            returning: async () => txState.returningRows,
          };
        },
      }),
      update: () => ({
        set: (values: unknown) => {
          txState.updated.push(values);
          return {
            where: () => ({
              returning: async () => txState.returningRows,
              then: (resolve: (value: unknown[]) => void) => resolve(txState.returningRows),
            }),
          };
        },
      }),
      select: () => selectChain(),
    };
    return fn(tx);
  },
}));

import {
  acceptCorrectionEventsForReview,
  createCorrectionEvent,
  createDraftCorrectionEvent,
  createEvalCaseFromCorrections,
  listActiveEvalCases,
  listCorrectionEventsForReview,
  rejectCorrectionEvent,
  upsertLearningPattern,
} from "../ai-review-learning-repository";

beforeEach(() => {
  txState.selectRows = [];
  txState.selectQueue = [];
  txState.returningRows = [{ id: correctionId }];
  txState.inserted = [];
  txState.updated = [];
});

describe("AI Review learning repository", () => {
  it("creates tenant-scoped correction events with PII default", async () => {
    const id = await createCorrectionEvent({
      tenantId,
      reviewId,
      fieldPath: "premium.totalMonthlyPremium",
      correctedValueJson: 2442,
      correctionType: "wrong_premium_aggregation",
      createdBy: userId,
    });

    expect(id).toBe(correctionId);
    expect(txState.inserted[0]).toMatchObject({
      tenantId,
      reviewId,
      correctedValueJson: 2442,
      piiLevel: "contains_customer_data",
      createdBy: userId,
    });
  });

  it("creates draft correction event and supersedes previous open draft", async () => {
    const id = await createDraftCorrectionEvent({
      tenantId,
      reviewId,
      fieldPath: "premium.totalMonthlyPremium",
      correctedValueJson: 2442,
      correctionType: "wrong_premium_aggregation",
      createdBy: userId,
    });

    expect(id).toBe(correctionId);
    expect(txState.inserted[0]).toMatchObject({
      tenantId,
      reviewId,
      fieldPath: "premium.totalMonthlyPremium",
      correctedValueJson: 2442,
    });
    expect(txState.inserted[0]).not.toHaveProperty("acceptedOnApproval");
    expect(txState.updated[0]).toEqual({ supersededBy: correctionId });
  });

  it("lists and accepts correction events only through tenant-scoped queries", async () => {
    txState.selectRows = [{ id: correctionId, tenantId, reviewId }];

    const rows = await listCorrectionEventsForReview({ tenantId, reviewId });
    const accepted = await acceptCorrectionEventsForReview({ tenantId, reviewId });

    expect(rows).toEqual(txState.selectRows);
    expect(accepted).toEqual([correctionId]);
    expect(txState.updated[0]).toMatchObject({
      acceptedOnApproval: true,
    });
    expect(txState.updated[0]).not.toHaveProperty("rejected");
    expect(txState.updated[0]).not.toHaveProperty("rejectedReason");
  });

  it("rejects one correction without deleting audit history", async () => {
    const rejected = await rejectCorrectionEvent({
      tenantId,
      correctionEventId: correctionId,
      rejectedReason: "Advisor kept existing value",
    });

    expect(rejected).toBe(true);
    expect(txState.updated[0]).toMatchObject({
      rejected: true,
      rejectedReason: "Advisor kept existing value",
      acceptedOnApproval: false,
      acceptedAt: null,
    });
  });

  it("upserts learning patterns by stable scope key", async () => {
    txState.selectRows = [];
    txState.returningRows = [{ id: "55555555-5555-4555-8555-555555555555" }];

    const id = await upsertLearningPattern({
      tenantId,
      scope: "product",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      fieldPath: "premium.totalMonthlyPremium",
      patternType: "premium_aggregation_rule",
      ruleText: "Sum numbered insured-person premiums.",
      confidence: 0.8,
      severity: "high",
      sourceCorrectionIds: [correctionId],
    });

    expect(id).toBe("55555555-5555-4555-8555-555555555555");
    expect(txState.inserted[0]).toMatchObject({
      tenantId,
      scope: "product",
      institutionName: "UNIQA",
      sourceCorrectionIds: [correctionId],
      confidence: "0.8",
    });
  });

  it("creates eval cases from tenant-scoped corrections", async () => {
    txState.selectQueue = [
      [{
        id: correctionId,
        reviewId,
        documentHash: "sha256:abc",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "premium.totalMonthlyPremium",
      }],
      [{
        extractedPayload: { premium: { totalMonthlyPremium: 1560 } },
        correctedPayload: { premium: { totalMonthlyPremium: 2442, frequency: "monthly" } },
      }],
    ];
    txState.returningRows = [{ id: "66666666-6666-4666-8666-666666666666" }];

    const id = await createEvalCaseFromCorrections({
      tenantId,
      reviewId,
      correctionIds: [correctionId],
    });

    expect(id).toBe("66666666-6666-4666-8666-666666666666");
    expect(txState.inserted[0]).toMatchObject({
      tenantId,
      sourceReviewId: reviewId,
      sourceCorrectionIds: [correctionId],
      expectedOutputJson: { premium: { totalMonthlyPremium: 2442, frequency: "monthly" } },
      criticalFields: ["premium.totalMonthlyPremium", "premium.frequency"],
      piiScrubbed: false,
      active: true,
    });
  });

  it("lists active eval cases", async () => {
    txState.selectRows = [{ id: "66666666-6666-4666-8666-666666666666", tenantId, active: true }];

    await expect(listActiveEvalCases({ tenantId })).resolves.toEqual(txState.selectRows);
  });
});
