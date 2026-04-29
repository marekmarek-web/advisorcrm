import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ContractReviewRow } from "../review-queue-repository";
import type { DocumentReviewEnvelope } from "../document-review-types";

const txState = {
  updateReturnRows: [{ id: "11111111-1111-4111-8111-111111111111" }],
  selectRows: [] as unknown[],
  selectQueue: [] as unknown[][],
  inserted: [] as unknown[],
  updated: [] as unknown[],
};

function nextSelectRows(): unknown[] {
  return txState.selectQueue.shift() ?? txState.selectRows;
}

function selectResult() {
  return {
    limit: async () => nextSelectRows(),
    then: (resolve: (value: unknown[]) => void) => resolve(nextSelectRows()),
  };
}

vi.mock("@/lib/db/service-db", () => ({
  withServiceTenantContext: async (_options: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: () => ({
        set: (values: unknown) => ({
          where: () => ({
            returning: async () => {
              txState.updated.push(values);
              return txState.updateReturnRows;
            },
            catch: async () => undefined,
            then: (resolve: (value: unknown) => void) => {
              txState.updated.push(values);
              resolve(undefined);
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (values: unknown) => {
          txState.inserted.push(values);
          return undefined;
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => selectResult(),
            limit: async () => nextSelectRows(),
            then: (resolve: (value: unknown[]) => void) => resolve(nextSelectRows()),
          }),
        }),
      }),
    };
    return fn(tx);
  },
}));

import {
  acceptAiReviewCorrectionEventsOnApproval,
  buildCorrectionHintsTrace,
  buildCorrectionEventValues,
  buildAiReviewLearningPatterns,
  buildAiReviewLearningScorecard,
  createEvalCaseDraftsForAcceptedCorrections,
  getCorrectionHints,
  mineLearningPatternDrafts,
  scoreAiReviewEvalCase,
} from "../ai-review-learning";
import {
  runAiReviewLearningValidators,
  validatePremiumAggregation,
  validatePublishEligibility,
} from "../ai-review-learning-validators";
import { buildAiReviewExtractionPromptVariables } from "../ai-review-prompt-variables";

function reviewRow(overrides: Partial<ContractReviewRow> = {}): ContractReviewRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: "33333333-3333-4333-8333-333333333333",
    fileName: "uniqa.pdf",
    storagePath: "hash:uniqa-multi",
    mimeType: "application/pdf",
    sizeBytes: 1,
    processingStatus: "review_required",
    processingStage: null,
    errorMessage: null,
    extractedPayload: {},
    clientMatchCandidates: null,
    draftActions: null,
    confidence: 0.7,
    reasonsForReview: [],
    reviewStatus: "pending",
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
    userDeclaredDocumentIntent: null,
    inputMode: "text_pdf",
    extractionMode: "text",
    detectedDocumentType: "life_insurance_contract",
    detectedDocumentSubtype: null,
    lifecycleStatus: "final_contract",
    documentIntent: "creates_new_product",
    extractionTrace: { promptVersion: "prompt-v1", schemaVersion: "schema-v1", aiReviewModel: "model-a", pipelineVersion: "pipeline-v2" },
    validationWarnings: [],
    fieldConfidenceMap: {},
    classificationReasons: [],
    dataCompleteness: null,
    sensitivityProfile: "financial_data",
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
    productCategory: null,
    productSubtypes: null,
    extractionConfidence: "medium",
    needsHumanReview: "true",
    missingFields: [],
    proposedAssumptions: {},
    createdAt: new Date("28.04.2026".split(".").reverse().join("-")),
    updatedAt: new Date("28.04.2026".split(".").reverse().join("-")),
    ...overrides,
  };
}

function envelope(overrides: Partial<DocumentReviewEnvelope> = {}): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: "life_insurance_contract",
      subtype: "life",
      lifecycleStatus: "final_contract",
      documentIntent: "creates_new_product",
      confidence: 0.9,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital" },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {
      contractNumber: { value: "UNIQA-1", status: "extracted", confidence: 0.9 },
      institutionName: { value: "UNIQA", status: "extracted", confidence: 0.9 },
      productName: { value: "Životní pojištění", status: "extracted", confidence: 0.9 },
    },
    evidence: [],
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
    reviewWarnings: [],
    suggestedActions: [],
    contentFlags: {
      isFinalContract: true,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: true,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
    sensitivityProfile: "financial_data",
    ...overrides,
  };
}

beforeEach(() => {
  txState.updateReturnRows = [{ id: "11111111-1111-4111-8111-111111111111" }];
  txState.selectRows = [];
  txState.selectQueue = [];
  txState.inserted = [];
  txState.updated = [];
});

describe("AI Review learning loop", () => {
  it("builds correction events with metadata from the original review", () => {
    const original = envelope({
      institutionName: undefined,
      productName: undefined,
      premium: { frequency: "monthly", totalMonthlyPremium: 1560, source: "manual_override", calculationBreakdown: [], validationWarnings: [] },
      insuredPersons: [{ order: 1, fullName: "První pojištěný", monthlyPremium: 1560 }],
    });
    const corrected = envelope({
      premium: { frequency: "monthly", totalMonthlyPremium: 2442, source: "sum_of_insured_persons", calculationBreakdown: [], validationWarnings: [] },
      insuredPersons: [
        { order: 1, fullName: "První pojištěný", monthlyPremium: 1560 },
        { order: 2, fullName: "Nikola", monthlyPremium: 882 },
      ],
    });
    const events = buildCorrectionEventValues({
      row: reviewRow({ extractedPayload: original }),
      correctedPayload: corrected,
      correctedFields: ["insuredPersons[1].fullName", "premium.totalMonthlyPremium"],
      correctedBy: "44444444-4444-4444-8444-444444444444",
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      tenantId: "33333333-3333-4333-8333-333333333333",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      promptVersion: "prompt-v1",
    });
    expect(events[1].correctionType).toBe("wrong_premium_aggregation");
  });

  it("accepts draft correction events on approval", async () => {
    const ids = await acceptAiReviewCorrectionEventsOnApproval({
      tenantId: "33333333-3333-4333-8333-333333333333",
      reviewId: "22222222-2222-4222-8222-222222222222",
    });

    expect(ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("creates eval case draft only for accepted critical corrections", async () => {
    txState.selectRows = [{
      id: "11111111-1111-4111-8111-111111111111",
      reviewId: "22222222-2222-4222-8222-222222222222",
      documentHash: "hash",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      fieldPath: "premium.totalMonthlyPremium",
    }];

    const count = await createEvalCaseDraftsForAcceptedCorrections({
      tenantId: "33333333-3333-4333-8333-333333333333",
      reviewId: "22222222-2222-4222-8222-222222222222",
      correctionIds: ["11111111-1111-4111-8111-111111111111"],
      expectedOutput: { premium: { totalMonthlyPremium: 2442 } },
    });

    expect(count).toBe(1);
    expect(txState.inserted[0]).toMatchObject({
      institutionName: "UNIQA",
      piiScrubbed: false,
      active: true,
    });
  });

  it("mines pattern and injects safe prompt hints", () => {
    const patterns = mineLearningPatternDrafts([
      {
        id: "11111111-1111-4111-8111-111111111111",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "premium.totalMonthlyPremium",
        correctionType: "wrong_premium_aggregation",
      },
    ]);
    const promptVars = buildAiReviewExtractionPromptVariables({
      documentText: "UNIQA Životní pojištění",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "uniqa.pdf",
      correctionHints: patterns.map((pattern) => pattern.promptHint).filter((hint): hint is string => Boolean(hint)),
    });

    expect(patterns[0].patternType).toBe("premium_aggregation_rule");
    expect(patterns[0].confidence).toBe(0.55);
    expect(patterns[0].validatorHintJson).toEqual({
      rule: "sum_numbered_insured_premiums",
      premiumLabels: ["Celkové běžné měsíční pojistné pro"],
      requireAllNumberedInsuredBlocks: true,
    });
    expect(promptVars.correction_hints).toContain("Known extraction hints from approved advisor corrections");
    expect(promptVars.correction_hints).toContain("Celkové měsíční pojistné smlouvy je součet všech pojištěných");
    expect(promptVars.correction_hints).not.toContain("Nikola");
  });

  it("mines participant, publish, classification, and field alias patterns without raw values", () => {
    const patterns = mineLearningPatternDrafts([
      {
        id: "11111111-1111-4111-8111-111111111111",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "participants[1].fullName",
        correctionType: "missing_field_added",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "publishIntent.shouldPublishToCrm",
        correctionType: "wrong_publish_decision",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "documentClassification.primaryType",
        correctionType: "wrong_document_classification",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "contractNumber",
        correctionType: "wrong_value_replaced",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        fieldPath: "contractNumber",
        correctionType: "wrong_value_replaced",
      },
    ]);

    expect(patterns.map((pattern) => pattern.patternType)).toEqual(expect.arrayContaining([
      "participant_detection_rule",
      "publish_decision_rule",
      "classification_hint",
      "field_alias",
    ]));
    expect(patterns.find((pattern) => pattern.patternType === "field_alias")?.supportCount).toBe(2);
    expect(patterns.find((pattern) => pattern.patternType === "field_alias")?.confidence).toBe(0.70);
    expect(patterns.find((pattern) => pattern.patternType === "publish_decision_rule")?.severity).toBe("critical");
    expect(JSON.stringify(patterns)).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{6}\/?\d{3,4}\b/i);
  });

  it("updates existing learning pattern with support count and last seen timestamp", async () => {
    txState.selectQueue = [
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          institutionName: "UNIQA",
          productName: "Životní pojištění",
          documentType: "life_insurance_contract",
          fieldPath: "premium.totalMonthlyPremium",
          correctionType: "wrong_premium_aggregation",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          institutionName: "UNIQA",
          productName: "Životní pojištění",
          documentType: "life_insurance_contract",
          fieldPath: "premium.perInsured[1].monthlyPremium",
          correctionType: "wrong_premium_aggregation",
        },
      ],
      [{ id: "99999999-9999-4999-8999-999999999999" }],
    ];

    const drafts = await buildAiReviewLearningPatterns({
      tenantId: "33333333-3333-4333-8333-333333333333",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].supportCount).toBe(2);
    expect(drafts[0].confidence).toBe(0.70);
    expect(txState.updated[0]).toMatchObject({
      supportCount: 2,
      confidence: "0.7",
    });
    expect((txState.updated[0] as { lastSeenAt?: Date }).lastSeenAt).toBeInstanceOf(Date);
  });

  it("returns no correction prompt section when no safe patterns exist", async () => {
    txState.selectRows = [];

    const hints = await getCorrectionHints({
      tenantId: "33333333-3333-4333-8333-333333333333",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
    });
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "UNIQA smlouva",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "uniqa.pdf",
      correctionHints: hints.promptHints,
    });

    expect(hints.promptHints).toEqual([]);
    expect(vars.correction_hints).toBeUndefined();
  });

  it("selects product scoped correction hints before broader patterns", async () => {
    txState.selectRows = [
      {
        id: "product-pattern",
        scope: "product",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        promptHint: "U tohoto produktu sečti pojistné všech očíslovaných pojištěných osob.",
        validatorHintJson: { rule: "sum_numbered_insured_premiums" },
        confidence: "0.70",
        supportCount: 2,
        updatedAt: new Date(),
      },
      {
        id: "tenant-pattern",
        scope: "tenant",
        institutionName: null,
        productName: null,
        documentType: null,
        promptHint: "Obecně ověř pole podle aktuálního dokumentu.",
        validatorHintJson: { rule: "field_attention" },
        confidence: "0.85",
        supportCount: 5,
        updatedAt: new Date(),
      },
    ];

    const hints = await getCorrectionHints({
      tenantId: "33333333-3333-4333-8333-333333333333",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
    });
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "UNIQA smlouva",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "uniqa.pdf",
      correctionHints: hints.promptHints,
    });

    expect(hints.patternIds[0]).toBe("product-pattern");
    expect(vars.correction_hints).toContain("U tohoto produktu sečti pojistné");
    expect(vars.correction_hints).toContain("These hints are anonymized");
  });

  it("rejects PII-like correction hints and omits their pattern ids", async () => {
    txState.selectRows = [
      {
        id: "pii-pattern",
        scope: "product",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        promptHint: "Klient jan@example.com má vždy pojistné 1000 Kč.",
        validatorHintJson: { rule: "field_attention" },
        confidence: "0.90",
        supportCount: 4,
        updatedAt: new Date(),
      },
      {
        id: "safe-pattern",
        scope: "product",
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        promptHint: "Ověř očíslované bloky pojištěných osob podle aktuálního dokumentu.",
        validatorHintJson: { rule: "require_numbered_participants" },
        confidence: "0.90",
        supportCount: 4,
        updatedAt: new Date(),
      },
    ];

    const hints = await getCorrectionHints({
      tenantId: "33333333-3333-4333-8333-333333333333",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
    });

    expect(hints.promptHints).toEqual(["Ověř očíslované bloky pojištěných osob podle aktuálního dokumentu."]);
    expect(hints.patternIds).toEqual(["safe-pattern"]);
  });

  it("builds extraction trace metadata for used learning pattern ids", () => {
    expect(buildCorrectionHintsTrace({
      promptHints: ["Ověř očíslované bloky pojištěných osob."],
      validatorHints: [{ rule: "require_numbered_participants" }],
      patternIds: ["pattern-1"],
    })).toEqual({
      learningHintsUsed: true,
      learningPatternIds: ["pattern-1"],
      learningHintCount: 1,
    });
  });

  it("validates premium aggregation and publish eligibility", () => {
    const env = envelope({
      insuredPersons: [
        { order: 1, fullName: "První pojištěný", monthlyPremium: 1560 },
        { order: 2, fullName: "Nikola", monthlyPremium: 882 },
      ],
      premium: { frequency: "monthly", totalMonthlyPremium: 1560, source: "manual_override", calculationBreakdown: [], validationWarnings: [] },
    });

    const result = validatePremiumAggregation(
      env,
      "Počet pojištěných: 1 dospělá osoba, 1 dítě\nCelkové běžné měsíční pojistné pro 1. pojištěného 1560\nCelkové běžné měsíční pojistné pro 2. pojištěného 882",
    );
    const publish = validatePublishEligibility({ envelope: result.envelope, uploadIntent: { isModelation: false }, reviewApproved: true });
    const modelationPublish = validatePublishEligibility({ envelope: result.envelope, uploadIntent: { isModelation: true }, reviewApproved: true });

    expect(result.envelope.premium?.totalMonthlyPremium).toBe(2442);
    expect(result.autoFixesApplied).toContain("premium.totalMonthlyPremium=sum_of_insured_persons");
    expect(publish.shouldPublishToCrm).toBe(true);
    expect(modelationPublish.shouldPublishToCrm).toBe(false);
  });

  it("covers UNIQA multi-insured correction loop and eval scorecard", () => {
    const initial = envelope({
      insuredPersons: [{ order: 1, fullName: "První pojištěný", monthlyPremium: 1560 }],
      premium: { frequency: "monthly", totalMonthlyPremium: 1560, source: "manual_override", calculationBreakdown: [], validationWarnings: [] },
    });
    const validation = runAiReviewLearningValidators({
      envelope: initial,
      documentText: "UNIQA Životní pojištění\nPočet pojištěných: 1 dospělá osoba, 1 dítě\n1. pojištěný\n2. pojištěný\nCelkové běžné měsíční pojistné pro 1. pojištěného 1560\nCelkové běžné měsíční pojistné pro 2. pojištěného 882",
      uploadIntent: { isModelation: false },
      reviewApproved: true,
    });
    const corrected = envelope({
      insuredPersons: [
        { order: 1, fullName: "První pojištěný", monthlyPremium: 1560 },
        { order: 2, fullName: "Nikola", monthlyPremium: 882 },
      ],
      premium: { frequency: "monthly", totalMonthlyPremium: 2442, source: "sum_of_insured_persons", calculationBreakdown: [], validationWarnings: [] },
      publishHints: { contractPublishable: true, reviewOnly: false, needsSplit: false, needsManualValidation: false, sensitiveAttachmentOnly: false },
    });
    const patterns = mineLearningPatternDrafts([{
      id: "11111111-1111-4111-8111-111111111111",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      fieldPath: "premium.totalMonthlyPremium",
      correctionType: "wrong_premium_aggregation",
    }]);
    const score = scoreAiReviewEvalCase({
      expectedOutput: corrected,
      actualOutput: corrected,
      criticalFields: ["premium.totalMonthlyPremium", "publishHints.contractPublishable"],
    });

    expect(validation.warnings.some((warning) => warning.code === "participant_count_mismatch")).toBe(true);
    expect(patterns[0].promptHint).toContain("Celkové měsíční pojistné smlouvy je součet všech pojištěných");
    expect(corrected.premium?.totalMonthlyPremium).toBe(2442);
    expect(score.publishDecision).toBe(true);
    expect(score.criticalExact).toBe(1);
  });

  it("scores UNIQA eval fixture for critical fields and thresholds", async () => {
    const fixture = await import("../../../../../../fixtures/ai-review-learning/uniqa-multi-insured-regression.json");
    const score = scoreAiReviewEvalCase({
      expectedOutput: fixture.default.expectedOutputJson,
      actualOutput: fixture.default.expectedOutputJson,
      criticalFields: fixture.default.criticalFields,
    });
    const scorecard = buildAiReviewLearningScorecard([score]);

    expect(score.participantCount).toBe(true);
    expect(score.premiumAggregation).toBe(true);
    expect(score.publishDecision).toBe(true);
    expect(score.classificationMatch).toBe(true);
    expect(scorecard).toMatchObject({
      cases: 1,
      schemaValid: 1,
      criticalExactMatch: 1,
      numericToleranceMatch: 1,
      participantCountMatch: 1,
      premiumAggregationMatch: 1,
      publishDecisionMatch: 1,
      classificationMatch: 1,
      pass: true,
    });
  });
});
