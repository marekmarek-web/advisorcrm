import { db } from "db";
import { contractUploadReviews } from "db";
import { contractReviewCorrections } from "db";
import { eq, and, desc } from "db";
import type { ContractProcessingStatus, ContractReviewStatus } from "db";
import { logAudit } from "@/lib/audit";

export type ApplyResultPayload = {
  createdClientId?: string;
  linkedClientId?: string;
  createdContractId?: string;
  createdPaymentId?: string;
  createdPaymentSetupId?: string;
  createdTaskId?: string;
  createdNoteId?: string;
  createdEmailDraftId?: string;
  /** Structured payment setup extracted from payment instruction documents. */
  paymentSetup?: {
    obligationName: string;
    paymentType: string;
    provider: string;
    contractReference: string;
    recipientAccount: string;
    iban: string;
    bankCode: string;
    variableSymbol: string;
    specificSymbol: string;
    regularAmount: string;
    oneOffAmount: string;
    currency: string;
    frequency: string;
    firstDueDate: string;
    clientNote: string;
  };
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
  ocrRequired?: boolean;
  pageCount?: number;
  qualityWarnings?: string[];
  warnings?: string[];
  failedStep?: string;
  adobePreprocessed?: boolean;
  adobeJobIds?: string[];
  adobeWarnings?: string[];
  readabilityScore?: number;
  ocrPdfPath?: string | null;
  normalizedPdfPath?: string | null;
  ocrConfidenceEstimate?: number;
  normalizedDocumentType?: string;
  classificationOverrideReason?: string;
  selectedSchema?: string;
  /** Adobe / preprocess phase duration (ms), Plan 3 observability. */
  preprocessDurationMs?: number;
  /** OpenAI pipeline duration after preprocess (ms). */
  pipelineDurationMs?: number;
  /** Structured extraction: full PDF vs text-only second pass (faster when safe). */
  extractionSecondPass?: "pdf" | "text";
  preprocessMode?: string;
  preprocessStatus?: string;
  /** 0–1 text / OCR coverage heuristic (Adobe + input mode). */
  textCoverageEstimate?: number;
  /** mapPrimaryToPipelineClassification — insurance_contract, payment_instructions, … */
  normalizedPipelineClassification?: string;
  rawClassification?: string;
  extractionRoute?: string;
  /** Plan 4: pipeline version triple for eval/versioning. */
  pipelineVersion?: string;
  promptVersion?: string;
  schemaVersion?: string;
  classifierVersion?: string;
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
  detectedDocumentSubtype: string | null;
  lifecycleStatus: string | null;
  documentIntent: string | null;
  extractionTrace: ExtractionTrace | null;
  validationWarnings: ValidationWarning[] | null;
  fieldConfidenceMap: Record<string, number> | null;
  classificationReasons: string[] | null;
  dataCompleteness: unknown;
  sensitivityProfile: string | null;
  sectionSensitivity: unknown;
  relationshipInference: unknown;
  originalExtractedPayload: unknown;
  correctedPayload: unknown;
  correctedFields: string[] | null;
  correctedDocumentType: string | null;
  correctedLifecycleStatus: string | null;
  fieldMarkedNotApplicable: string[] | null;
  linkedClientOverride: string | null;
  linkedDealOverride: string | null;
  confidenceOverride: number | null;
  ignoredWarnings: string[] | null;
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
  const primaryValues = {
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
  };

  let row: { id: string } | undefined;
  try {
    [row] = await db
      .insert(contractUploadReviews)
      .values(primaryValues)
      .returning({ id: contractUploadReviews.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pgCode = (err as { code?: string })?.code;

    // Backward-compatible fallback: some production DBs still miss newer optional columns.
    // Retry with the minimal subset required by earliest migration.
    const isMissingColumn =
      pgCode === "42703" ||
      message.includes("column") && message.includes("does not exist");

    if (!isMissingColumn) throw err;

    [row] = await db
      .insert(contractUploadReviews)
      .values({
        tenantId: insert.tenantId,
        fileName: insert.fileName,
        storagePath: insert.storagePath,
        processingStatus: insert.processingStatus,
      })
      .returning({ id: contractUploadReviews.id });
  }
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

/**
 * Hard-delete a contract review row for the tenant (CASCADE removes contract_review_corrections).
 * Caller should remove the Storage object first when possible.
 */
export async function deleteContractReview(
  id: string,
  tenantId: string
): Promise<{ deleted: boolean; storagePath: string | null }> {
  const [existing] = await db
    .select({
      id: contractUploadReviews.id,
      storagePath: contractUploadReviews.storagePath,
    })
    .from(contractUploadReviews)
    .where(and(eq(contractUploadReviews.id, id), eq(contractUploadReviews.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return { deleted: false, storagePath: null };
  }

  await db
    .delete(contractUploadReviews)
    .where(and(eq(contractUploadReviews.id, id), eq(contractUploadReviews.tenantId, tenantId)));

  return { deleted: true, storagePath: existing.storagePath };
}

/** Full list projection when DB has pipeline + phase-two columns. */
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
  detectedDocumentType: contractUploadReviews.detectedDocumentType,
  detectedDocumentSubtype: contractUploadReviews.detectedDocumentSubtype,
  lifecycleStatus: contractUploadReviews.lifecycleStatus,
  documentIntent: contractUploadReviews.documentIntent,
  sensitivityProfile: contractUploadReviews.sensitivityProfile,
  uploadedBy: contractUploadReviews.uploadedBy,
  createdAt: contractUploadReviews.createdAt,
  updatedAt: contractUploadReviews.updatedAt,
};

/** Minimal columns for older DBs missing redesign / phase-two ALTERs. */
const listReviewColumnsLegacy = {
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
  detectedDocumentType: contractUploadReviews.detectedDocumentType,
  uploadedBy: contractUploadReviews.uploadedBy,
  createdAt: contractUploadReviews.createdAt,
  updatedAt: contractUploadReviews.updatedAt,
};

function isPgMissingColumnError(err: unknown): boolean {
  const pgCode = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  return (
    pgCode === "42703" ||
    (message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist"))
  );
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
  const limit = options?.limit ?? 50;

  try {
    const rows = await db
      .select(listReviewColumns)
      .from(contractUploadReviews)
      .where(conditions)
      .orderBy(desc(contractUploadReviews.createdAt))
      .limit(limit);
    return rows as ContractReviewRow[];
  } catch (err) {
    if (!isPgMissingColumnError(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn(
      "[listContractReviews] falling back to legacy column set (run Supabase patches: document_review_redesign + document_review_phase_two)"
    );
    const rows = await db
      .select(listReviewColumnsLegacy)
      .from(contractUploadReviews)
      .where(conditions)
      .orderBy(desc(contractUploadReviews.createdAt))
      .limit(limit);
    return rows.map((r) => {
      const base = r as ContractReviewRow;
      return {
        ...base,
        detectedDocumentSubtype: base.detectedDocumentSubtype ?? null,
        lifecycleStatus: base.lifecycleStatus ?? null,
        documentIntent: null,
        sensitivityProfile: base.sensitivityProfile ?? null,
        sectionSensitivity: null,
        relationshipInference: null,
      } as ContractReviewRow;
    });
  }
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
    detectedDocumentSubtype?: string | null;
    lifecycleStatus?: string | null;
    documentIntent?: string | null;
    extractionTrace?: ExtractionTrace | null;
    validationWarnings?: ValidationWarning[] | null;
    fieldConfidenceMap?: Record<string, number> | null;
    classificationReasons?: string[] | null;
    dataCompleteness?: unknown;
    sensitivityProfile?: string | null;
    sectionSensitivity?: unknown;
    relationshipInference?: unknown;
    originalExtractedPayload?: unknown;
    correctedPayload?: unknown;
    correctedFields?: string[] | null;
    correctedDocumentType?: string | null;
    correctedLifecycleStatus?: string | null;
    fieldMarkedNotApplicable?: string[] | null;
    linkedClientOverride?: string | null;
    linkedDealOverride?: string | null;
    confidenceOverride?: number | null;
    ignoredWarnings?: string[] | null;
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
    correctedDocumentType?: string | null;
    correctedLifecycleStatus?: string | null;
    fieldMarkedNotApplicable?: string[];
    linkedClientOverride?: string | null;
    linkedDealOverride?: string | null;
    confidenceOverride?: number | null;
    ignoredWarnings?: string[];
    correctionReason?: string | null;
    correctedBy?: string | null;
  }
): Promise<void> {
  const row = await getContractReviewById(id, tenantId);
  if (!row) throw new Error("Contract review not found");
  await updateContractReview(id, tenantId, {
    originalExtractedPayload: row.extractedPayload,
    extractedPayload: params.correctedPayload,
    correctedPayload: params.correctedPayload,
    correctedFields: params.correctedFields,
    correctedDocumentType: params.correctedDocumentType ?? null,
    correctedLifecycleStatus: params.correctedLifecycleStatus ?? null,
    fieldMarkedNotApplicable: params.fieldMarkedNotApplicable ?? null,
    linkedClientOverride: params.linkedClientOverride ?? null,
    linkedDealOverride: params.linkedDealOverride ?? null,
    confidenceOverride: params.confidenceOverride ?? null,
    ignoredWarnings: params.ignoredWarnings ?? null,
    correctionReason: params.correctionReason ?? null,
    correctedBy: params.correctedBy ?? null,
    correctedAt: new Date(),
  });
  let comparisonDelta: unknown = null;
  try {
    const { compareExtractedToCorrected } = await import("./eval-comparison");
    if (
      row.extractedPayload &&
      typeof row.extractedPayload === "object" &&
      params.correctedPayload &&
      typeof params.correctedPayload === "object"
    ) {
      comparisonDelta = compareExtractedToCorrected(
        row.extractedPayload as Record<string, unknown>,
        params.correctedPayload as Record<string, unknown>,
      );
    }
  } catch {
    // comparison is best-effort
  }

  await db
    .insert(contractReviewCorrections)
    .values({
      tenantId,
      contractReviewId: id,
      correctedDocumentType: params.correctedDocumentType ?? null,
      correctedLifecycleStatus: params.correctedLifecycleStatus ?? null,
      correctedFieldValues: params.correctedPayload,
      fieldMarkedNotApplicable: params.fieldMarkedNotApplicable ?? null,
      linkedClientOverride: params.linkedClientOverride ?? null,
      linkedDealOverride: params.linkedDealOverride ?? null,
      confidenceOverride: params.confidenceOverride ?? null,
      ignoredWarnings: params.ignoredWarnings ?? null,
      correctedBy: params.correctedBy ?? null,
      ...(comparisonDelta ? { comparisonDelta } : {}),
    })
    .catch(() => {});
  await logAudit({
    tenantId,
    userId: params.correctedBy ?? null,
    action: "extraction_reviewed",
    entityType: "contract_review",
    entityId: id,
    meta: { correctedFields: params.correctedFields },
  }).catch(() => {});
}
