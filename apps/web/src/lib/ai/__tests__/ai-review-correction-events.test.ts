import { describe, expect, it } from "vitest";
import type { ContractReviewRow } from "../review-queue-repository";
import {
  buildManualCorrectionEventInput,
  inferAiReviewCorrectionType,
} from "../ai-review-correction-events";
import { resolveAiReviewCorrectionFieldPath } from "../ai-review-correction-paths";

const baseRow = {
  id: "22222222-2222-4222-8222-222222222222",
  tenantId: "33333333-3333-4333-8333-333333333333",
  storagePath: "sha256:document-hash",
  detectedDocumentType: "life_insurance_contract",
  lifecycleStatus: "final_contract",
  correctedDocumentType: null,
  correctedLifecycleStatus: null,
  applyResultPayload: null,
  extractionTrace: {
    extractionRunId: "run-1",
    promptVersion: "prompt-v1",
    schemaVersion: "schema-v1",
    aiReviewModel: "claude-test",
    pipelineVersion: "pipeline-v1",
  },
  extractedPayload: {
    documentClassification: {
      primaryType: "life_insurance_contract",
      lifecycleStatus: "final_contract",
    },
    extractedFields: {
      institutionName: { value: "UNIQA" },
      productName: { value: "Životní pojištění" },
      totalMonthlyPremium: { value: 1560 },
    },
  },
} as unknown as ContractReviewRow;

describe("AI Review correction event mapping", () => {
  it("maps editable UI field ids to stable learning-loop paths", () => {
    expect(resolveAiReviewCorrectionFieldPath("extractedFields.totalMonthlyPremium")).toBe("premium.totalMonthlyPremium");
    expect(resolveAiReviewCorrectionFieldPath("extractedFields.paymentFrequency")).toBe("premium.frequency");
    expect(resolveAiReviewCorrectionFieldPath("participants.1.birthDate")).toBe("participants[1].birthDate");
    expect(resolveAiReviewCorrectionFieldPath("publishHints.contractPublishable")).toBe("publishIntent.shouldPublishToCrm");
  });

  it("builds a draft correction event input from a field edit", () => {
    const event = buildManualCorrectionEventInput(baseRow, {
      fieldId: "extractedFields.totalMonthlyPremium",
      correctedValue: 2442,
      createdBy: "44444444-4444-4444-8444-444444444444",
      fieldLabel: "Měsíční pojistné",
      sourcePage: 2,
      evidenceSnippet: "Celkové běžné měsíční pojistné pro 2. pojištěného 882",
    });

    expect(event).toMatchObject({
      tenantId: "33333333-3333-4333-8333-333333333333",
      reviewId: "22222222-2222-4222-8222-222222222222",
      documentHash: "sha256:document-hash",
      institutionName: "UNIQA",
      productName: "Životní pojištění",
      documentType: "life_insurance_contract",
      lifecycleStatus: "final_contract",
      fieldPath: "premium.totalMonthlyPremium",
      fieldLabel: "Měsíční pojistné",
      originalValueJson: 1560,
      correctedValueJson: 2442,
      correctionType: "wrong_premium_aggregation",
      sourcePage: 2,
      promptVersion: "prompt-v1",
      schemaVersion: "schema-v1",
      pipelineVersion: "pipeline-v1",
      modelName: "claude-test",
      piiLevel: "contains_customer_data",
    });
  });

  it("does not create correction event when corrected value equals original AI value", () => {
    const event = buildManualCorrectionEventInput(baseRow, {
      fieldId: "extractedFields.totalMonthlyPremium",
      correctedValue: "1560",
      createdBy: "44444444-4444-4444-8444-444444444444",
    });

    expect(event).toBeNull();
  });

  it("infers correction type from path and missing/original values", () => {
    expect(inferAiReviewCorrectionType({
      fieldPath: "documentClassification.lifecycleStatus",
      originalValue: "proposal",
      correctedValue: "final_contract",
    })).toBe("wrong_document_classification");
    expect(inferAiReviewCorrectionType({
      fieldPath: "extractedFields.contractNumber",
      originalValue: null,
      correctedValue: "ABC123",
    })).toBe("missing_field_added");
    expect(inferAiReviewCorrectionType({
      fieldPath: "publishIntent.shouldPublishToCrm",
      originalValue: false,
      correctedValue: true,
    })).toBe("wrong_publish_decision");
  });
});
