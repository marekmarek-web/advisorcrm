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
  /** Stable machine path used for audit and AI Review correction learning. */
  fieldPath?: string;
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
  /** Evidence-aware apply policy (Fáze 8) */
  applyPolicy?: "auto_apply" | "prefill_confirm" | "manual_required" | "do_not_apply";
  /** Human-readable apply policy label for advisor UI */
  applyPolicyLabel?: string;
  /** Whether field requires advisor confirmation before applying to CRM */
  requiresConfirmation?: boolean;
  /**
   * Short excerpt from the source document supporting the extracted value.
   * Populated when the server envelope includes `evidenceSnippet` on the field.
   * Rendered as a tooltip / expandable hint in the review panel.
   */
  evidenceSnippet?: string;
  /**
   * Machine-readable source kind (e.g. "policyholder_block", "payment_block",
   * or "page_image_fallback" when the value was rescued via multimodal fallback).
   * Passed through to the UI so it can render kind-specific badges.
   */
  sourceKind?: string;
  /**
   * Machine-readable evidence tier from the pipeline. `"recovered_from_image"`
   * indicates the value came from page-image rescue and should be treated as
   * advisor-review-mandatory regardless of confidence.
   */
  evidenceTier?: string;
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

/**
 * Stav pracovního kroku — business čeština pro UI.
 *
 * - available:        Krok je dostupný a lze ho provést / spustit.
 * - executed:         Krok byl úspěšně proveden.
 * - skipped:          Krok byl přeskočen (automaticky nebo poradcem).
 * - recommended:      Krok je doporučení — nelze ho spustit automaticky, poradce rozhodne.
 * - cannot_auto:      Krok nelze provést automaticky — vyžaduje ruční akci mimo systém.
 * - not_applicable:   Krok se na tento dokument nevztahuje (žádná mrtvá CTA).
 */
export type DraftActionStatus =
  | "available"
  | "executed"
  | "skipped"
  | "recommended"
  | "cannot_auto"
  | "not_applicable";

export const DRAFT_ACTION_STATUS_LABELS: Record<DraftActionStatus, string> = {
  available: "Dostupné",
  executed: "Provedeno",
  skipped: "Přeskočeno",
  recommended: "Doporučeno ručně",
  cannot_auto: "Nelze provést automaticky",
  not_applicable: "Nevztahuje se",
};

export type DraftAction = {
  type: string;
  label: string;
  payload: Record<string, unknown>;
  status?: DraftActionStatus;
  statusNote?: string;
};

/** Rozhodnutí párování klienta (stejné hodnoty jako v DB / extraction trace). */
export type MatchVerdict = "existing_match" | "near_match" | "ambiguous_match" | "no_match";

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
  /** Fáze 9/10: Apply policy enforcement trace — co se skutečně zapsalo. */
  policyEnforcementTrace?: {
    supportingDocumentGuard: boolean;
    outputMode?: string;
    summary: {
      totalAutoApplied: number;
      totalPendingConfirmation: number;
      totalManualRequired: number;
      totalExcluded: number;
    };
    contactEnforcement?: {
      autoAppliedFields: string[];
      pendingConfirmationFields: string[];
      manualRequiredFields: string[];
      excludedFields: string[];
    };
    contractEnforcement?: {
      autoAppliedFields: string[];
      pendingConfirmationFields: string[];
      manualRequiredFields: string[];
      excludedFields: string[];
    };
    paymentEnforcement?: {
      autoAppliedFields: string[];
      pendingConfirmationFields: string[];
      manualRequiredFields: string[];
      excludedFields: string[];
    };
  };
  /** Stav klientského portálu u propojeného kontaktu po aplikaci (žádné vendor heuristiky). */
  portalClientAccess?: {
    hasActiveClientPortal: boolean;
    hasLinkedUserAccount: boolean;
    hasAcceptedInvitation: boolean;
    /** Deterministický verdict — source of truth pro invite/re-invite rozhodování. */
    accessVerdict?: string;
  };
  /** Phase 5A: ID přiloženého dokumentu (bez vytvoření smlouvy). */
  linkedDocumentId?: string;
  /** Phase 5A: True pokud propojení dokumentu se smlouvou selhalo (parciální výsledek). */
  documentLinkWarning?: boolean;
  /** Phase 5A: Deterministický publish outcome — co skutečně vzniklo po apply. */
  publishOutcome?: {
    mode:
      | "supporting_doc_only"
      | "internal_document_only"
      | "product_published"
      | "product_published_visible_to_client"
      | "publish_partial_failure";
    paymentOutcome: "payment_setup_published" | "payment_setup_skipped";
    label: string;
    visibleToClient: boolean;
  };
};

export type ExtractionDocument = {
  id: string;
  fileName: string;
  documentType: string;
  /**
   * Detected primary type (pipeline code) — NOT a user-visible label.
   * Used by the review shell to gate UI warnings (e.g. HARD_SUPPORTING banner).
   */
  detectedPrimaryType?: string;
  /**
   * True when the document is classified as a hard-supporting type (consent/declaration,
   * payslip, tax return, bank statement, medical questionnaire, AML/FATCA, …). Such
   * documents WILL NOT create a contract/payment on apply, even if advisor approves.
   * Mirrors `isSupportingDocumentOnly` from apply-policy-enforcement.ts.
   */
  isSupportingOnlyDocument?: boolean;
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
  /** Verdikt párování z pipeline; null = starší záznamy před zavedením modelu. */
  matchVerdict?: MatchVerdict | null;
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
    modelName?: string;
    promptVersion?: string;
    schemaVersion?: string;
    pipelineVersion?: string;
    learningHintsUsed?: boolean;
    learningPatternIds?: string[];
    learningHintCount?: number;
    validatorWarnings?: string[];
    validatorAutoFixesApplied?: string[];
    matchVerdict?: MatchVerdict;
    matchVerdictReason?: string;
    autoResolvedClientId?: string;
    ocrWatchdogExpired?: boolean;
    ocrScanPendingSinceMs?: number;
  };
  /** Server: policy while `scan_pending_ocr` (GET refreshes msUntilExpiry). */
  ocrScanPendingPolicy?: { maxWaitMs: number; msUntilExpiry: number };
  validationWarnings?: Array<{ code?: string; message: string; field?: string }>;
  classificationReasons?: string[];
  fieldConfidenceMap?: Record<string, number>;
  /** Quality gate result for apply readiness. */
  applyGate?: {
    readiness: "ready_for_apply" | "review_required" | "blocked_for_apply";
    blockedReasons: string[];
    applyBarrierReasons: string[];
    warnings: string[];
    /** Gate reasons that the advisor explicitly overrode (persisted to DB via ignoredWarnings). */
    overriddenReasons?: string[];
  };
  /** Human-readable pipeline sub-step while status is processing (from API `processingStage`). */
  processingStageLabel?: string;
  /**
   * Product classification from classifyProduct() — shown as a badge above
   * the extraction groups and used in production reports for BJ calculation.
   */
  productCategory?: string | null;
  productSubtypes?: string[] | null;
  /** "high" | "medium" | "low" — overall AI extraction confidence. */
  extractionConfidenceLevel?: "high" | "medium" | "low" | null;
  /** When true, reviewer must verify data before apply. */
  needsHumanReview?: boolean;
  /** Fields the LLM could not reliably infer — UI shows them in a checklist. */
  missingFields?: string[];
  /** Proposed fallback values from AI that require reviewer confirmation. */
  proposedAssumptions?: Record<string, unknown>;
  /** Server input mode (e.g. text_pdf) for readability-aware field warnings. */
  inputMode?: string;
  /** Structured advisor summary + work actions (not raw envelope dump). */
  advisorReview?: AdvisorReviewViewModel;
  /** Client-side: synthetic groups were added when extraction envelope had no flattenable fields. */
  reviewUiMeta?: {
    usedSyntheticGroups?: boolean;
    showDebugFieldPath?: boolean;
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
      parameter?: string | number;
      premium?: string | number;
      termEnd?: string;
      notes?: string;
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
      iban?: string;
      bankCode?: string;
      paymentMethod?: string;
    } | null;
    /** Identity / document data (OP, platnost, vydal, lékař) */
    identityData?: {
      idCardNumber?: string;
      idCardIssuedBy?: string;
      idCardValidUntil?: string;
      idCardIssuedAt?: string;
      generalPractitioner?: string;
    } | null;
    /** Fund resolution data for investment products */
    fundResolution?: {
      resolvedFundId?: string | null;
      resolvedFundCategory?: string | null;
      fvSourceType?: string | null;
      resolvedFundName?: string | null;
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
