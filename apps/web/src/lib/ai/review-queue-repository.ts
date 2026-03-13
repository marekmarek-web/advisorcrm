import { db } from "db";
import { contractUploadReviews } from "db";
import { eq, and, desc } from "drizzle-orm";
import type { ContractProcessingStatus, ContractReviewStatus } from "db";

export type ApplyResultPayload = {
  createdClientId?: string;
  linkedClientId?: string;
  createdContractId?: string;
  createdPaymentId?: string;
  createdTaskId?: string;
  createdNoteId?: string;
  createdEmailDraftId?: string;
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
    .select()
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
  }
): Promise<void> {
  await db
    .update(contractUploadReviews)
    .set({
      ...update,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contractUploadReviews.id, id),
        eq(contractUploadReviews.tenantId, tenantId)
      )
    );
}
