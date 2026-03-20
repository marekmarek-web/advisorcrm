import { db } from "db";
import { contractUploadReviews } from "db";
import { eq, and, desc } from "db";
import type { ContractProcessingStatus, ContractReviewStatus } from "db";
import { logAudit } from "@/lib/audit";

export type ApplyResultPayload = {
  createdClientId?: string;
  linkedClientId?: string;
  createdContractId?: string;
  createdPaymentId?: string;
  createdTaskId?: string;
  createdNoteId?: string;
  createdEmailDraftId?: string;
  bridgeSuggestions?: Array<{
    id: string;
    label: string;
    href: string;
    type: "analysis" | "service_action";
  }>;
};

/** Extraction trace stored in DB (no document content). */
export type ExtractionTrace = {
  inputMode?: string;
  documentType?: string;
  classificationConfidence?: number;
  extractionMode?: string;
  warnings?: string[];
  failedStep?: string;
};

/** Validation warning item. */
export type ValidationWarning = {
  code?: string;
  message: string;
  field?: string;
};

export type ContractReviewRow = {
  id: string;
  tenantId: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  processingStatus: ContractProcessingStatus;
  errorMessage: string | null;
  extractedPayload: unknown;
  clientMatchCandidates: unknown;
  draftActions: unknown;
  confidence: number | null;
  reasonsForReview: string[] | null;
  reviewStatus: ContractReviewStatus | null;
  uploadedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  appliedBy: string | null;
  appliedAt: Date | null;
  matchedClientId: string | null;
  createNewClientConfirmed: string | null;
  applyResultPayload: ApplyResultPayload | null;
  reviewDecisionReason: string | null;
  inputMode: string | null;
  extractionMode: string | null;
  detectedDocumentType: string | null;
  extractionTrace: ExtractionTrace | null;
  validationWarnings: ValidationWarning[] | null;
  fieldConfidenceMap: Record<string, number> | null;
  classificationReasons: string[] | null;
  originalExtractedPayload: unknown;
  correctedPayload: unknown;
  correctedFields: string[] | null;
  correctionReason: string | null;
  correctedBy: string | null;
  correctedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function createContractReview(insert: {
  tenantId: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  processingStatus: ContractProcessingStatus;
  errorMessage?: string | null;
  extractedPayload?: unknown;
  clientMatchCandidates?: unknown;
  draftActions?: unknown;
  confidence?: number | null;
  reasonsForReview?: string[] | null;
  uploadedBy?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(contractUploadReviews)
    .values({
      tenantId: insert.tenantId,
      fileName: insert.fileName,
      storagePath: insert.storagePath,
      mimeType: insert.mimeType ?? null,
      sizeBytes: insert.sizeBytes ?? null,
      processingStatus: insert.processingStatus,
      errorMessage: insert.errorMessage ?? null,
      extractedPayload: insert.extractedPayload ?? null,
      clientMatchCandidates: insert.clientMatchCandidates ?? null,
      draftActions: insert.draftActions ?? null,
      confidence: insert.confidence ?? null,
      reasonsForReview: insert.reasonsForReview ?? null,
      uploadedBy: insert.uploadedBy ?? null,
    })
    .returning({ id: contractUploadReviews.id });
  if (!row?.id) throw new Error("Failed to create contract review row");
  return row.id;
}

export async function getContractReviewById(
  id: string,
  tenantId: string
): Promise<ContractReviewRow | null> {
  const [row] = await db
    .select()
    .from(contractUploadReviews)
    .where(
      and(
        eq(contractUploadReviews.id, id),
        eq(contractUploadReviews.tenantId, tenantId)
      )
    )
    .limit(1);
  return (row as ContractReviewRow) ?? null;
}

/** Base columns – existují i v DB bez pipeline migrace (bez input_mode atd.) */
const listReviewColumns = {
  id: contractUploadReviews.id,
  tenantId: contractUploadReviews.tenantId,
  fileName: contractUploadReviews.fileName,
  storagePath: contractUploadReviews.storagePath,
  mimeType: contractUploadReviews.mimeType,
  sizeBytes: contractUploadReviews.sizeBytes,
  processingStatus: contractUploadReviews.processingStatus,
  errorMessage: contractUploadReviews.errorMessage,
  extractedPayload: contractUploadReviews.extractedPayload,
  clientMatchCandidates: contractUploadReviews.clientMatchCandidates,
  draftActions: contractUploadReviews.draftActions,
  confidence: contractUploadReviews.confidence,
  reasonsForReview: contractUploadReviews.reasonsForReview,
  reviewStatus: contractUploadReviews.reviewStatus,
  uploadedBy: contractUploadReviews.uploadedBy,
  createdAt: contractUploadReviews.createdAt,
  updatedAt: contractUploadReviews.updatedAt,
};

export async function listContractReviews(
  tenantId: string,
  options?: { limit?: number; reviewStatus?: ContractReviewStatus }
): Promise<ContractReviewRow[]> {
  const conditions =
    options?.reviewStatus != null
      ? and(
          eq(contractUploadReviews.tenantId, tenantId),
          eq(contractUploadReviews.reviewStatus, options.reviewStatus)
        )
      : eq(contractUploadReviews.tenantId, tenantId);
  const rows = await db
    .select(listReviewColumns)
    .from(contractUploadReviews)
    .where(conditions)
    .orderBy(desc(contractUploadReviews.createdAt))
    .limit(options?.limit ?? 50);
  return rows as ContractReviewRow[];
}

export async function updateContractReview(
  id: string,
  tenantId: string,
  update: {
    processingStatus?: ContractProcessingStatus;
    errorMessage?: string | null;
    extractedPayload?: unknown;
    clientMatchCandidates?: unknown;
    draftActions?: unknown;
    confidence?: number | null;
    reasonsForReview?: string[] | null;
    reviewStatus?: ContractReviewStatus;
    reviewedBy?: string | null;
    reviewedAt?: Date | null;
    rejectReason?: string | null;
    appliedBy?: string | null;
    appliedAt?: Date | null;
    matchedClientId?: string | null;
    createNewClientConfirmed?: string | null;
    applyResultPayload?: ApplyResultPayload | null;
    reviewDecisionReason?: string | null;
    inputMode?: string | null;
    extractionMode?: string | null;
    detectedDocumentType?: string | null;
    extractionTrace?: ExtractionTrace | null;
    validationWarnings?: ValidationWarning[] | null;
    fieldConfidenceMap?: Record<string, number> | null;
    classificationReasons?: string[] | null;
    originalExtractedPayload?: unknown;
    correctedPayload?: unknown;
    correctedFields?: string[] | null;
    correctionReason?: string | null;
    correctedBy?: string | null;
    correctedAt?: Date | null;
  }
): Promise<void> {
  const createNewClientConfirmed =
    update.createNewClientConfirmed === "true" ? ("true" as const) : null;
  await db
    .update(contractUploadReviews)
    .set({
      ...update,
      createNewClientConfirmed,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contractUploadReviews.id, id),
        eq(contractUploadReviews.tenantId, tenantId)
      )
    );
}

/**
 * Save a human correction for eval / feedback loop.
 * Stores original extracted payload, corrected payload, and metadata.
 */
export async function saveContractCorrection(
  id: string,
  tenantId: string,
  params: {
    correctedPayload: unknown;
    correctedFields: string[];
    correctionReason?: string | null;
    correctedBy?: string | null;
  }
): Promise<void> {
  const row = await getContractReviewById(id, tenantId);
  if (!row) throw new Error("Contract review not found");
  await updateContractReview(id, tenantId, {
    originalExtractedPayload: row.extractedPayload,
    correctedPayload: params.correctedPayload,
    correctedFields: params.correctedFields,
    correctionReason: params.correctionReason ?? null,
    correctedBy: params.correctedBy ?? null,
    correctedAt: new Date(),
  });
  await logAudit({
    tenantId,
    userId: params.correctedBy ?? null,
    action: "extraction_reviewed",
    entityType: "contract_review",
    entityId: id,
    meta: { correctedFields: params.correctedFields },
  }).catch(() => {});
}
