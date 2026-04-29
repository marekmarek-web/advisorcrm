import type { AiReviewCorrectionType } from "db";
import type { CreateCorrectionEventInput } from "./ai-review-learning-repository";
import type { ContractReviewRow } from "./review-queue-repository";
import { getValueByPath } from "./ai-review-learning";
import { resolveAiReviewCorrectionFieldPath } from "./ai-review-correction-paths";

export type ManualFieldCorrectionInput = {
  fieldId: string;
  correctedValue: unknown;
  createdBy: string;
  fieldPath?: string | null;
  fieldLabel?: string | null;
  originalAiValue?: unknown;
  sourcePage?: number | null;
  evidenceSnippet?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unwrapFieldValue(value: unknown): unknown {
  if (isRecord(value) && "value" in value) return value.value;
  return value;
}

export function normalizeCorrectionComparable(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return null;
    return trimmed.replace(/\s+/g, " ");
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function getOriginalValueForReviewField(
  payload: unknown,
  fieldId: string,
  stableFieldPath: string,
  fallback?: unknown,
): unknown {
  const byFieldId = getValueByPath(payload, fieldId);
  if (byFieldId !== undefined) return unwrapFieldValue(byFieldId);

  const byStablePath = getValueByPath(payload, stableFieldPath);
  if (byStablePath !== undefined) return unwrapFieldValue(byStablePath);

  if (fieldId.startsWith("extractedFields.")) {
    const key = fieldId.slice("extractedFields.".length);
    const cell = getValueByPath(payload, `extractedFields.${key}`);
    if (cell !== undefined) return unwrapFieldValue(cell);
  }

  return fallback;
}

export function inferAiReviewCorrectionType(params: {
  fieldPath: string;
  originalValue: unknown;
  correctedValue: unknown;
}): AiReviewCorrectionType {
  const path = params.fieldPath.toLowerCase();
  if (path === "premium.totalmonthlypremium" || path.startsWith("premium.perinsured")) {
    return "wrong_premium_aggregation";
  }
  if (path.startsWith("documentclassification.")) return "wrong_document_classification";
  if (path.startsWith("publish") || path.startsWith("publishintent.")) return "wrong_publish_decision";

  const original = normalizeCorrectionComparable(params.originalValue);
  const corrected = normalizeCorrectionComparable(params.correctedValue);
  if (!original && corrected) return "missing_field_added";
  if (original && corrected) return "wrong_value_replaced";
  return "manual_override";
}

function extractMetadata(row: ContractReviewRow, correctedPayload: unknown) {
  const trace = row.extractionTrace ?? {};
  const payload = correctedPayload ?? row.extractedPayload;
  return {
    institutionName:
      normalizeCorrectionComparable(getValueByPath(payload, "institutionName")) ??
      normalizeCorrectionComparable(getValueByPath(payload, "extractedFields.institutionName.value")),
    productName:
      normalizeCorrectionComparable(getValueByPath(payload, "productName")) ??
      normalizeCorrectionComparable(getValueByPath(payload, "extractedFields.productName.value")),
    documentType:
      row.correctedDocumentType ??
      row.detectedDocumentType ??
      normalizeCorrectionComparable(getValueByPath(payload, "documentClassification.primaryType")) ??
      normalizeCorrectionComparable(getValueByPath(payload, "documentType")),
    lifecycleStatus:
      row.correctedLifecycleStatus ??
      row.lifecycleStatus ??
      normalizeCorrectionComparable(getValueByPath(payload, "documentClassification.lifecycleStatus")),
    extractionRunId: normalizeCorrectionComparable(getValueByPath(trace, "extractionRunId")),
    promptVersion: trace.promptVersion ?? null,
    schemaVersion: trace.schemaVersion ?? null,
    modelName: trace.aiReviewModel ?? null,
    pipelineVersion: trace.pipelineVersion ?? (trace.aiReviewPipeline ? String(trace.aiReviewPipeline) : null),
  };
}

export function buildManualCorrectionEventInput(
  row: ContractReviewRow,
  input: ManualFieldCorrectionInput,
): CreateCorrectionEventInput | null {
  const fieldPath = input.fieldPath?.trim() || resolveAiReviewCorrectionFieldPath(input.fieldId);
  if (!fieldPath) return null;

  const originalValue = getOriginalValueForReviewField(
    row.extractedPayload,
    input.fieldId,
    fieldPath,
    input.originalAiValue,
  );
  const originalComparable = normalizeCorrectionComparable(originalValue);
  const correctedComparable = normalizeCorrectionComparable(input.correctedValue);
  if (originalComparable === correctedComparable) return null;

  const metadata = extractMetadata(row, row.extractedPayload);
  const linkedDocumentId = row.applyResultPayload?.linkedDocumentId;

  return {
    tenantId: row.tenantId,
    reviewId: row.id,
    documentId: typeof linkedDocumentId === "string" ? linkedDocumentId : null,
    documentHash: row.storagePath ?? null,
    extractionRunId: metadata.extractionRunId,
    institutionName: metadata.institutionName,
    productName: metadata.productName,
    documentType: metadata.documentType,
    lifecycleStatus: metadata.lifecycleStatus,
    fieldPath,
    fieldLabel: input.fieldLabel ?? fieldPath,
    originalValueJson: originalValue ?? null,
    correctedValueJson: input.correctedValue,
    normalizedOriginalValue: originalComparable,
    normalizedCorrectedValue: correctedComparable,
    correctionType: inferAiReviewCorrectionType({
      fieldPath,
      originalValue,
      correctedValue: input.correctedValue,
    }),
    sourcePage: input.sourcePage ?? null,
    evidenceSnippet: input.evidenceSnippet ?? null,
    promptVersion: metadata.promptVersion,
    schemaVersion: metadata.schemaVersion,
    modelName: metadata.modelName,
    pipelineVersion: metadata.pipelineVersion,
    createdBy: input.createdBy,
    piiLevel: "contains_customer_data",
  };
}
