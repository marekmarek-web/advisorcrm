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
  /** Fáze 9: Apply policy enforcement trace — audit log toho, co se skutečně zapsalo. */
  policyEnforcementTrace?: {
    supportingDocumentGuard: boolean;
    outputMode?: string;
    summary: {
      totalAutoApplied: number;
      totalPendingConfirmation: number;
      totalManualRequired: number;
      totalExcluded: number;
    };
    contactEnforcement?: { autoAppliedFields: string[]; pendingConfirmationFields: string[]; manualRequiredFields: string[]; excludedFields: string[] };
    contractEnforcement?: { autoAppliedFields: string[]; pendingConfirmationFields: string[]; manualRequiredFields: string[]; excludedFields: string[] };
    paymentEnforcement?: { autoAppliedFields: string[]; pendingConfirmationFields: string[]; manualRequiredFields: string[]; excludedFields: string[] };
  };
  /**
   * F3 Slice 2: Conflict/pending fields from contact merge policy.
   * Each entry = { fieldKey, incomingValue, reason }.
   */
  pendingFields?: Array<{
    fieldKey: string;
    incomingValue: string | null;
    reason: "manual_protected" | "conflict";
  }>;
  /**
   * Fáze 11: Per-field confirmation trace — záznamy o potvrzení jednotlivých pending polí poradcem.
   * Klíč = fieldKey (např. "birthDate", "contractNumber"), hodnota = metadata potvrzení.
   */
  confirmedFieldsTrace?: Record<string, {
    confirmedAt: string;
    confirmedBy: string;
    scope: "contact" | "contract" | "payment";
    targetId: string | null;
    fromValue: unknown;
  }>;
  /** Stav klientského portálu u propojeného kontaktu po aplikaci. */
  portalClientAccess?: {
    hasActiveClientPortal: boolean;
    hasLinkedUserAccount: boolean;
    hasAcceptedInvitation: boolean;
    /** Deterministický verdict — source of truth pro invite/re-invite rozhodování. */
    accessVerdict?: string;
  };
  /**
   * Phase 3.5: ID dokumentu v tabulce `documents` po linkage v post-commit kroku.
   * Null/absent = document linking se nezdařil (viz documentLinkWarning).
   */
  linkedDocumentId?: string;
  /**
   * Phase 3.5: Varování pokud document linkage selhal v post-commit kroku.
   * Přítomnost tohoto klíče signalizuje partiální stav (apply OK, doc link ne).
   */
  documentLinkWarning?: string;
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
  extractionSecondPass?: "pdf" | "text" | "prompt_text";
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
  /** AI Review v2 */
  aiReviewPipeline?: string;
  aiClassifierJson?: Record<string, unknown>;
  aiReviewRouterOutcome?: string;
  aiReviewRouterReasonCodes?: string[];
  aiReviewExtractionPromptKey?: string;
  /**
   * Primary structured extraction path when not using combined_single_call.
   * prompt_builder = OpenAI Prompt Builder (pmpt_*) for router promptKey.
   * schema_text_wrap = local `buildSchemaPrompt` + document text wrap.
   * file_pdf = `createResponseWithFile` + short file-based prompt.
   */
  aiReviewExtractionBuilder?: "prompt_builder" | "schema_text_wrap" | "file_pdf";
  /** First chars of pmpt_* id when `prompt_builder` — for rollout smoke / support (not full secret). */
  aiReviewExtractionPmptFingerprint?: string | null;
  classifierDurationMs?: number;
  extractionDurationMs?: number;
  validationDurationMs?: number;
  reviewDecisionDurationMs?: number;
  clientMatchDurationMs?: number;
  /**
   * Which source powered the core (primary) extraction documentText.
   * adobe_structured_pages → used structured page text from structuredData.json
   * markdown → used ruleBasedTextHint (markdown content)
   * fallback → empty or very short hint
   */
  coreExtractionSource?: "adobe_structured_pages" | "markdown" | "fallback";
  llmReviewDecisionText?: string;
  llmClientMatchText?: string;
  llmClientMatchDurationMs?: number;
  /** Parsed from optional client-match LLM (guardrails). */
  llmClientMatchKind?: string;
  /**
   * Deterministic client-match verdict; may mirror top-level DB column when also stored in trace.
   */
  matchVerdict?: string | null;
  /** Classifier v2: false → skip automatic structured extraction (review path). */
  supportedForDirectExtraction?: boolean;
  scanPendingReason?: string;
  totalPipelineDurationMs?: number;
  /**
   * Anthropic/Claude provider path observability.
   * Set by run-contract-review-processing.ts from getAiReviewProviderMeta().
   */
  aiReviewProvider?: string;
  aiReviewModel?: string;
  /**
   * Input mode for the primary Claude extraction call.
   * compact_section_text = bundle_section_context / contractual_section_text (most efficient)
   * structured_text      = Adobe structured pages text
   * markdown             = extracted_text / document_text from markdown preprocess
   * raw_pdf              = PDF bytes via base64 block (rescue / fallback only)
   * prompt_builder_text  = postprocess JSON payloads (small, not the document itself)
   */
  aiReviewInputMode?: string;
  /** Estimated chars sent to Claude as primary document content (proxy for token cost). */
  aiReviewInputSizeChars?: number;
  /**
   * Runtime extraction debug trace — captured at key pipeline steps for diagnostics.
   * Set when AI_REVIEW_DEBUG=1 or in non-production environments.
   * Steps: classifierRaw → routerDecision → rawModelOutput → beforeZod → afterCoercion → exportViewModel
   */
  debugTrace?: {
    classifierRaw?: Record<string, unknown>;
    routerDecision?: { outcome: string; promptKey?: string; reasonCodes: string[] };
    rawModelOutputHead?: string;
    beforeZodKeys?: string[];
    afterCoercionFieldCount?: number;
    afterCoercionStatus?: string;
    exportViewModelGroups?: number;
  };
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
  processingStage: string | null;
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
  /** Deterministic client match verdict. Null for legacy rows. */
  matchVerdict: string | null;
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
  processingStage: contractUploadReviews.processingStage,
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
        processingStage: base.processingStage ?? null,
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
    processingStage?: string | null;
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
    matchVerdict?: string | null;
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
