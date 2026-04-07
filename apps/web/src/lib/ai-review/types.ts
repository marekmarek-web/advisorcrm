import type { ContractProcessingStatus } from "db";

export type FieldStatus = "success" | "warning" | "error";

export type RecommendationType =
  | "warning"
  | "insight"
  | "opportunity"
  | "compliance"
  | "next_step";

export type RecommendationSeverity = "low" | "medium" | "high" | "critical";

export type FieldFilter =
  | "all"
  | "warning"
  | "error"
  | "edited"
  | "unconfirmed";

export type FieldSource = "ai" | "ocr" | "manual";

export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected" | "applied";

/** Jednotný seznam s DB / Drizzle (`contract_upload_reviews.processing_status`). */
export type ProcessingStatus = ContractProcessingStatus;

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedField = {
  id: string;
  groupId: string;
  label: string;
  value: string;
  normalizedValue?: string;
  confidence: number;
  status: FieldStatus;
  message?: string;
  page?: number;
  boundingBox?: BoundingBox;
  sourceType: FieldSource;
  isConfirmed: boolean;
  isEdited: boolean;
  originalAiValue: string;
  manualValue?: string;
  updatedBy?: string;
  updatedAt?: string;
  /** Advisor-facing evidence status: "Nalezeno" | "Odvozeno" | "Chybí" */
  displayStatus?: "Nalezeno" | "Odvozeno" | "Chybí";
  /** Advisor-facing source label: e.g. "z bloku Pojistník", "z tabulky plateb" */
  displaySource?: string;
};

export type ExtractedGroup = {
  id: string;
  name: string;
  iconName: string;
  fields: ExtractedField[];
};

export type AIRecommendation = {
  id: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  linkedFieldIds: string[];
  linkedPage?: number;
  linkedBoundingBoxes?: BoundingBox[];
  actionState: "pending" | "created" | "dismissed";
  dismissed: boolean;
  createdAt: string;
};

export type ExtractionDiagnostics = {
  ocrQuality: "good" | "fair" | "poor";
  extractionCoverage: number;
  totalFields: number;
  extractedFields: number;
  unresolvedFieldCount: number;
  warningCount: number;
  errorCount: number;
  conflictingValueCount: number;
  pagesWithoutReadableText: number[];
  notes: string[];
};

export type ClientMatchCandidate = {
  clientId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  matchedFields: Record<string, boolean>;
  displayName?: string;
};

export type DraftAction = {
  type: string;
  label: string;
  payload: Record<string, unknown>;
};

/**
 * Payment sync preview for advisor — built from canonical payment payload
 * before any apply action, so advisor sees exactly what will be written.
 */
export type PaymentSyncStatus =
  | "will_sync"
  | "will_draft"
  | "blocked_missing_fields"
  | "skipped_modelation"
  | "no_payment_data";

export type PaymentSyncPreview = {
  status: PaymentSyncStatus;
  /** Human-readable summary line for the advisor. */
  summary: string;
  /** Fields that are present and will be written. */
  presentFields: Array<{ label: string; value: string }>;
  /** Fields that are required but missing. */
  missingFields: Array<{ label: string }>;
  /** Warning messages from quality-gates (humanized). */
  warnings: string[];
};

/** Advisor-facing structured summary (main panel, not raw schema dump). */
export type AdvisorReviewViewModel = {
  recognition: string;
  client: string;
  product: string;
  payments: string;
  healthSensitive: string;
  /** Volitelné narrative shrnutí z Prompt Builder (`documentSummaryForAdvisor`). */
  llmExecutiveBrief?: string;
  manualChecklist: string[];
  workActions: DraftAction[];
  debugSnapshot: Record<string, unknown>;
  /** Phase 3D: payment sync preview built from canonical payload. */
  paymentSyncPreview?: PaymentSyncPreview;
};

export type ApplyResultPayload = {
  createdClientId?: string;
  linkedClientId?: string;
  createdContractId?: string;
  createdPaymentId?: string;
  createdPaymentSetupId?: string;
  createdTaskId?: string;
  createdNoteId?: string;
  createdEmailDraftId?: string;
  /** Structured payment setup fields written to client_payment_setups. */
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

export type ExtractionDocument = {
  id: string;
  fileName: string;
  documentType: string;
  clientName: string;
  uploadTime: string;
  pageCount: number;
  globalConfidence: number;
  reviewStatus: ReviewStatus;
  processingStatus: ProcessingStatus;
  extractionProvider: "internal" | "adobe" | "mixed";
  uploadSource: string;
  lastProcessedAt: string;
  executiveSummary: string;
  recommendations: AIRecommendation[];
  diagnostics: ExtractionDiagnostics;
  groups: ExtractedGroup[];
  extraRecommendations: AIRecommendation[];
  pdfUrl: string;
  errorMessage?: string;
  reasonsForReview?: string[];
  clientMatchCandidates: ClientMatchCandidate[];
  draftActions: DraftAction[];
  matchedClientId?: string;
  createNewClientConfirmed?: string;
  isApplied: boolean;
  applyResultPayload?: ApplyResultPayload;
  /**
   * Phase 4D: publish readiness signal derived from gate + review status.
   * Used by UI to show a pre-apply summary card.
   */
  publishReadiness?: "ready_for_publish" | "partially_reviewed" | "review_required" | "blocked" | "published" | "publish_failed";
  extractionTrace?: {
    failedStep?: string;
    warnings?: string[];
    /** AI Review v2 classifier raw JSON (for advisor-facing labels). */
    aiClassifierJson?: Record<string, unknown>;
  };
  validationWarnings?: Array<{ code?: string; message: string; field?: string }>;
  classificationReasons?: string[];
  fieldConfidenceMap?: Record<string, number>;
  /** Quality gate result for apply readiness. */
  applyGate?: {
    readiness: "ready_for_apply" | "review_required" | "blocked_for_apply";
    blockedReasons: string[];
    applyBarrierReasons: string[];
    warnings: string[];
  };
  /** Human-readable pipeline sub-step while status is processing (from API `processingStage`). */
  processingStageLabel?: string;
  /** Server input mode (e.g. text_pdf) for readability-aware field warnings. */
  inputMode?: string;
  /** Structured advisor summary + work actions (not raw envelope dump). */
  advisorReview?: AdvisorReviewViewModel;
  /** Client-side: synthetic groups were added when extraction envelope had no flattenable fields. */
  reviewUiMeta?: {
    usedSyntheticGroups?: boolean;
  };
  /**
   * Phase 2+3 canonical fields from Agent A normalizer.
   * Passed through from extractedPayload — never raw JSON in UI.
   */
  canonicalFields?: {
    /** Packet segmentation metadata */
    packetMeta?: {
      isBundle: boolean;
      bundleConfidence?: number;
      primarySubdocumentType?: string;
      subdocumentCandidates?: Array<{ type: string; label: string; confidence?: number }>;
      hasSensitiveAttachment?: boolean;
      packetWarnings?: string[];
    } | null;
    /** Publishing guidance */
    publishHints?: {
      contractPublishable: boolean;
      reviewOnly?: boolean;
      needsSplit?: boolean;
      needsManualValidation?: boolean;
      sensitiveAttachmentOnly?: boolean;
      reasons?: string[];
    } | null;
    /** Structured persons list */
    participants?: Array<{
      fullName?: string;
      birthDate?: string;
      role?: string;
      address?: string;
      occupation?: string;
    }> | null;
    /** Structured insured risks per participant */
    insuredRisks?: Array<{
      linkedParticipant?: string;
      riskType?: string;
      riskLabel?: string;
      insuredAmount?: string | number;
      premium?: string | number;
      termEnd?: string;
    }> | null;
    /** Health questionnaire sections */
    healthQuestionnaires?: Array<{
      linkedParticipant?: string;
      questionnairePresent?: boolean;
      sectionSummary?: string;
    }> | null;
    /** Investment data */
    investmentData?: {
      strategy?: string;
      isModeledData?: boolean;
      funds?: Array<{ name: string; allocation?: string | number }>;
    } | null;
    /** Payment data */
    paymentData?: {
      variableSymbol?: string;
      paymentFrequency?: string;
      accountNumber?: string;
      bankAccount?: string;
      paymentMethod?: string;
    } | null;
  };
  /** From GET review `pipelineInsights` — routing, preprocess, payment preview. */
  pipelineInsights?: {
    normalizedPipelineClassification?: string;
    extractionRoute?: string;
    rawClassification?: string;
    preprocessStatus?: string;
    preprocessMode?: string;
    adobePreprocessed?: boolean;
    adobeWarnings?: string[];
    textCoverageEstimate?: number;
    readabilityScore?: number;
    failedStep?: string;
    paymentPreview?: Record<string, unknown>;
    preprocessDurationMs?: number;
    pipelineDurationMs?: number;
    totalProcessingDurationMs?: number;
    extractionSecondPass?: "pdf" | "text";
  };
};

export type ExtractionReviewState = {
  activeFieldId: string | null;
  activePage: number;
  zoomLevel: number;
  filter: FieldFilter;
  collapsedGroups: Record<string, boolean>;
  dismissedRecommendations: Record<string, boolean>;
  editedFields: Record<string, string>;
  confirmedFields: Record<string, boolean>;
  isFullscreen: boolean;
  showPdfOnMobile: boolean;
};

export type ExtractionReviewAction =
  | { type: "SET_ACTIVE_FIELD"; fieldId: string | null; page?: number }
  | { type: "SET_PAGE"; page: number }
  | { type: "SET_ZOOM"; level: number }
  | { type: "SET_FILTER"; filter: FieldFilter }
  | { type: "TOGGLE_GROUP"; groupId: string }
  | { type: "DISMISS_RECOMMENDATION"; recId: string }
  | { type: "RESTORE_RECOMMENDATION"; recId: string }
  | { type: "EDIT_FIELD"; fieldId: string; value: string }
  | { type: "CONFIRM_FIELD"; fieldId: string }
  | { type: "REVERT_FIELD"; fieldId: string }
  | { type: "SET_FULLSCREEN"; isFullscreen: boolean }
  | { type: "SET_SHOW_PDF_MOBILE"; show: boolean };
