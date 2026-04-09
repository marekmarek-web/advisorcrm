/**
 * AI Photo / Image Intake — domain types, contracts and enums.
 *
 * Standalone capability lane within the AI assistant.
 * NOT part of AI Review (PDF/contract pipeline).
 * Reuses existing canonical action surface, preview/confirm flow and write actions.
 */

import type {
  CanonicalIntentType,
  WriteActionType,
  ProductDomain,
  ExecutionStep,
  ExecutionPlan,
} from "../assistant-domain-model";

// ---------------------------------------------------------------------------
// A) Input taxonomy
// ---------------------------------------------------------------------------

export const IMAGE_INPUT_TYPES = [
  "screenshot_client_communication",
  "photo_or_scan_document",
  "screenshot_payment_details",
  "screenshot_bank_or_finance_info",
  "supporting_reference_image",
  "general_unusable_image",
  "mixed_or_uncertain_image",
] as const;
export type ImageInputType = (typeof IMAGE_INPUT_TYPES)[number];

/** Fine-grained internal subtypes (not exposed to advisor UI). */
export const IMAGE_INPUT_SUBTYPES = [
  "client_chat_single",
  "client_chat_multi",
  "email_screenshot",
  "payment_instruction",
  "bank_confirmation",
  "document_scan_single_page",
  "document_photo_perspective",
  "reference_info_card",
  "non_text_visual",
  "low_quality_unreadable",
] as const;
export type ImageInputSubtype = (typeof IMAGE_INPUT_SUBTYPES)[number];

// ---------------------------------------------------------------------------
// B) Output modes
// ---------------------------------------------------------------------------

export const IMAGE_OUTPUT_MODES = [
  "client_message_update",
  "structured_image_fact_intake",
  "identity_contact_intake",
  "contact_update_from_image",
  "payment_details_portal_update",
  "supporting_reference_image",
  "ambiguous_needs_input",
  "no_action_archive_only",
] as const;
export type ImageOutputMode = (typeof IMAGE_OUTPUT_MODES)[number];

// ---------------------------------------------------------------------------
// C) Normalized image asset reference
// ---------------------------------------------------------------------------

export type NormalizedImageAsset = {
  assetId: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  /** Pixel dimensions after normalization (null if unknown). */
  width: number | null;
  height: number | null;
  /** SHA-256 content hash for dedup (null if not computed yet). */
  contentHash: string | null;
  storageUrl: string | null;
  thumbnailUrl: string | null;
  uploadedAt: Date;
};

// ---------------------------------------------------------------------------
// D) Preflight / quality
// ---------------------------------------------------------------------------

export const IMAGE_QUALITY_LEVELS = ["good", "acceptable", "poor", "unusable"] as const;
export type ImageQualityLevel = (typeof IMAGE_QUALITY_LEVELS)[number];

export type ImagePreflightResult = {
  eligible: boolean;
  qualityLevel: ImageQualityLevel;
  /** true when content hash matches a previously processed asset in this session. */
  isDuplicate: boolean;
  mimeSupported: boolean;
  sizeWithinLimits: boolean;
  /** Early exit reason if not eligible (e.g. "unsupported_mime", "file_too_large"). */
  rejectReason: string | null;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// E) Lane decision
// ---------------------------------------------------------------------------

export const LANE_DECISIONS = [
  "image_intake",
  "ai_review_handoff_suggestion",
  "not_relevant",
] as const;
export type LaneDecision = (typeof LANE_DECISIONS)[number];

export type LaneDecisionResult = {
  lane: LaneDecision;
  confidence: number;
  reason: string;
  /** If ai_review_handoff_suggestion, explain why. */
  handoffReason: string | null;
};

// ---------------------------------------------------------------------------
// F) Input classification
// ---------------------------------------------------------------------------

export type InputClassificationResult = {
  inputType: ImageInputType;
  subtype: ImageInputSubtype | null;
  confidence: number;
  containsText: boolean;
  likelyMessageThread: boolean;
  likelyDocument: boolean;
  likelyPayment: boolean;
  likelyFinancialInfo: boolean;
  uncertaintyFlags: string[];
};

// ---------------------------------------------------------------------------
// G) Client / case binding
// ---------------------------------------------------------------------------

export const CLIENT_BINDING_STATES = [
  "bound_client_confident",
  "bound_case_confident",
  "weak_candidate",
  "multiple_candidates",
  "insufficient_binding",
] as const;
export type ClientBindingState = (typeof CLIENT_BINDING_STATES)[number];

export type ClientBindingResult = {
  state: ClientBindingState;
  clientId: string | null;
  clientLabel: string | null;
  confidence: number;
  /** When multiple_candidates, list of possible matches. */
  candidates: Array<{ id: string; label: string; score: number }>;
  source:
    | "session_context"
    | "ui_context"
    | "image_signal"
    | "crm_match"
    | "none"
    | "identity_context_mismatch"
    | "explicit_user_text";
  warnings: string[];
  /**
   * When the document identity disagrees with the CRM route context, binding is cleared
   * but we keep the open contact id for optional CTAs (e.g. open client card).
   */
  suppressedActiveClientId?: string | null;
  suppressedActiveClientLabel?: string | null;
  /** Explainable binding reason for telemetry / UI copy decisions. */
  reason?: string | null;
  /** Conflicting signals that prevented a stronger binding. */
  conflicts?: string[];
};

export type CaseBindingResult = {
  state: ClientBindingState;
  caseId: string | null;
  caseLabel: string | null;
  confidence: number;
  candidates: Array<{ id: string; label: string; score: number }>;
  source: "session_context" | "ui_context" | "image_signal" | "crm_match" | "none";
};

// ---------------------------------------------------------------------------
// H) Evidence model
// ---------------------------------------------------------------------------

export type EvidenceReference = {
  sourceAssetId: string;
  /** Raw text span from the image (null if non-text evidence). */
  evidenceText: string | null;
  /** Bounding region hint (null in Phase 1). */
  sourceRegion: { x: number; y: number; w: number; h: number } | null;
  confidence: number;
};

// ---------------------------------------------------------------------------
// I) Extracted fact bundle (placeholder for Phase 2+)
// ---------------------------------------------------------------------------

export const FACT_TYPES = [
  "client_request",
  "client_status_change",
  "document_received",
  "payment_amount",
  "payment_account",
  "variable_symbol",
  "deadline_date",
  "appointment_request",
  "follow_up_needed",
  "reference_only",
  "unknown_unusable",
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export type FieldDiffStatus = "new" | "same" | "conflict" | "unreadable" | "missing";

export type ExtractedImageFact = {
  factType: FactType;
  value: string | number | boolean | null;
  normalizedValue: string | null;
  confidence: number;
  evidence: EvidenceReference | null;
  isActionable: boolean;
  needsConfirmation: boolean;
  /** Phase 3: whether the fact was directly observed in image or inferred/suggested. */
  observedVsInferred: "observed" | "inferred";
  /** Phase 3: raw key from model output (e.g. "what_client_said", "amount"). */
  factKey: string;
  /** Existing CRM value for diff preview (null when not compared yet). */
  existingCrmValue?: string | null;
  /** Diff status against existing CRM (null when comparison not performed). */
  diffStatus?: FieldDiffStatus | null;
  /** Target CRM field name (null when no mapping). */
  targetCrmField?: string | null;
};

export type ExtractedFactBundle = {
  facts: ExtractedImageFact[];
  missingFields: string[];
  ambiguityReasons: string[];
  /** Phase 3: whether facts came from real multimodal extraction or stub. */
  extractionSource: "multimodal_pass" | "stub";
};

export function emptyFactBundle(): ExtractedFactBundle {
  return { facts: [], missingFields: [], ambiguityReasons: [], extractionSource: "stub" };
}

// ---------------------------------------------------------------------------
// Phase 3: Multimodal combined pass result
// ---------------------------------------------------------------------------

export type MultimodalFactItem = {
  factKey: string;
  value: string | null;
  confidence: number;
  source: "observed" | "inferred";
};

export type MultimodalCombinedPassResult = {
  inputType: ImageInputType;
  confidence: number;
  rationale: string;
  /** e.g. "none" | "low" | "medium" | "high" */
  actionabilityLevel: "none" | "low" | "medium" | "high";
  /** Possible person name or reference in the image (for CRM binding hint). */
  possibleClientNameSignal: string | null;
  facts: MultimodalFactItem[];
  missingFields: string[];
  ambiguityReasons: string[];
  /** Short intent for draft reply generation (only for communication screenshots). */
  draftReplyIntent: string | null;
};

// Extended classification result with Phase 3 multimodal enrichments
export type InputClassificationResultV2 = InputClassificationResult & {
  /** Hint from multimodal pass for downstream extraction. */
  extractionHint: string | null;
  /** e.g. "none" | "low" | "medium" | "high" */
  actionabilityLevel: "none" | "low" | "medium" | "high" | null;
  /** Whether multimodal pass detected a possible client name reference. */
  possibleClientSignalPresence: boolean;
  /** Whether multimodal pass was used for this classification. */
  upgradeFromMultimodal: boolean;
};

// ---------------------------------------------------------------------------
// J) Proposed action plan (maps to canonical action surface)
// ---------------------------------------------------------------------------

export type ImageIntakeActionCandidate = {
  intentType: CanonicalIntentType;
  writeAction: WriteActionType | null;
  label: string;
  reason: string;
  confidence: number;
  requiresConfirmation: boolean;
  params: Record<string, unknown>;
};

export type ImageIntakeActionPlan = {
  outputMode: ImageOutputMode;
  recommendedActions: ImageIntakeActionCandidate[];
  draftReplyText: string | null;
  whyThisAction: string;
  whyNotOtherActions: string | null;
  needsAdvisorInput: boolean;
  safetyFlags: string[];
  actionAuthority: ImageActionAuthorityLevel;
};

export function emptyActionPlan(outputMode: ImageOutputMode): ImageIntakeActionPlan {
  return {
    outputMode,
    recommendedActions: [],
    draftReplyText: null,
    whyThisAction: "",
    whyNotOtherActions: null,
    needsAdvisorInput: false,
    safetyFlags: [],
    actionAuthority: "preview_only",
  };
}

export const IMAGE_ACTION_AUTHORITY_LEVELS = [
  "preview_only",
  "note",
  "attach",
  "update_contact",
  "create_task",
] as const;
export type ImageActionAuthorityLevel = (typeof IMAGE_ACTION_AUTHORITY_LEVELS)[number];

export type IntentContract = {
  userGoal:
    | "understand_image"
    | "summarize"
    | "create_note"
    | "attach_to_client"
    | "update_contact"
    | "create_task"
    | "create_contact"
    | "portal_payment_update"
    | "draft_reply"
    | "unknown";
  targetEntity: "active_client" | "explicit_client" | "image_client" | "unknown";
  allowedActionLevel: ImageActionAuthorityLevel;
  requiresExplicitConfirmation: boolean;
  explanation: string;
  evidence: string[];
};

export type ResolvedAssistantContext = {
  activeClientId: string | null;
  lockedClientId: string | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  conversationDigest: string | null;
  pendingImageIntent: boolean;
  lastUserGoal: string | null;
  lastClientReference: string | null;
  lastImagePreviewSummary: string | null;
};

// ---------------------------------------------------------------------------
// K) Image intake request / response envelope
// ---------------------------------------------------------------------------

export type ImageIntakeRequest = {
  sessionId: string;
  tenantId: string;
  userId: string;
  assets: NormalizedImageAsset[];
  activeClientId: string | null;
  activeOpportunityId: string | null;
  activeCaseId: string | null;
  /** Free-text message sent alongside the image (may be empty). */
  accompanyingText: string | null;
  /** Channel from which the intake was triggered. */
  channel: string | null;
  resolvedContext?: ResolvedAssistantContext | null;
};

export type ImageIntakeRouteOptions = {
  tenantId: string;
  userId: string;
  channel: string | null;
  accompanyingText: string | null;
  assetsTruncated?: boolean;
  resolvedContext?: ResolvedAssistantContext | null;
};

export type ImageIntakeResponse = {
  intakeId: string;
  laneDecision: LaneDecisionResult;
  preflight: ImagePreflightResult;
  classification: InputClassificationResult | null;
  clientBinding: ClientBindingResult;
  caseBinding: CaseBindingResult;
  factBundle: ExtractedFactBundle;
  actionPlan: ImageIntakeActionPlan;
  /** Mapped to existing StepPreviewItem[] for preview/confirm flow. */
  previewSteps: unknown[];
  /** Trace for auditing / replay. */
  trace: ImageIntakeTrace;
};

// ---------------------------------------------------------------------------
// L) Preview payload for image intake
// ---------------------------------------------------------------------------

export type ImageIntakePreviewPayload = {
  intakeId: string;
  outputMode: ImageOutputMode;
  inputType: ImageInputType;
  clientLabel: string | null;
  caseLabel: string | null;
  summary: string;
  factsSummary: string[];
  uncertainties: string[];
  recommendedActions: Array<{
    label: string;
    action: string;
    reason: string;
  }>;
  /** Signals whether the plan is write-ready or needs advisor input first. */
  writeReady: boolean;
  warnings: string[];
  /**
   * Phase 9: Household / multi-client ambiguity note.
   * Non-null when household_ambiguous or household_detected state was found.
   */
  householdAmbiguityNote: string | null;
  /**
   * Phase 9: Document multi-image set outcome note.
   * Non-null when assets were evaluated as a document set.
   */
  documentSetNote: string | null;
  /**
   * Phase 9: AI Review handoff lifecycle note.
   * Non-null when a reviewRowId is known and lifecycle was looked up.
   */
  lifecycleStatusNote: string | null;
  /**
   * Phase 9: Intent-assist cache status hint (for debug/ops visibility).
   * Omitted from user-facing output but available for admin/logging.
   */
  intentAssistCacheStatus: import("./types").IntentAssistCacheStatus | null;
};

// ---------------------------------------------------------------------------
// M) Archive-only / no-write / ambiguous results
// ---------------------------------------------------------------------------

export type ArchiveOnlyResult = {
  reason: string;
  summary: string;
  suggestAttach: boolean;
  attachTarget: "client" | "case" | "none";
};

export type AmbiguousResult = {
  whatWasRecognized: string;
  whatIsUnknown: string;
  advisorChoices: string[];
  minimumInputNeeded: string;
};

// ---------------------------------------------------------------------------
// N) Trace (audit / replay)
// ---------------------------------------------------------------------------

export type ImageIntakeTrace = {
  intakeId: string;
  sessionId: string;
  assetIds: string[];
  laneDecision: LaneDecision;
  inputType: ImageInputType | null;
  outputMode: ImageOutputMode | null;
  clientBindingState: ClientBindingState;
  factCount: number;
  actionCount: number;
  writeReady: boolean;
  guardrailsTriggered: string[];
  durationMs: number;
  timestamp: Date;
};

// ---------------------------------------------------------------------------
// Phase 4: Multi-image stitching
// ---------------------------------------------------------------------------

export const STITCHING_DECISIONS = [
  "grouped_thread",    // Related screenshots — likely same conversation thread
  "grouped_related",   // Related but not obviously same thread (similar context/type)
  "standalone",        // Unrelated to other assets in batch
  "duplicate",         // Exact or near-duplicate of another asset
] as const;
export type StitchingDecision = (typeof STITCHING_DECISIONS)[number];

export type StitchedAssetGroup = {
  groupId: string;
  decision: StitchingDecision;
  assetIds: string[];
  /** Primary asset to use for multimodal pass (most representative). */
  primaryAssetId: string;
  /** Asset IDs suppressed as duplicates of primary. */
  duplicateAssetIds: string[];
  confidence: number;
  rationale: string;
};

export type MultiImageStitchingResult = {
  groups: StitchedAssetGroup[];
  standaloneAssetIds: string[];
  duplicateAssetIds: string[];
  /** true when stitching found any groupable assets. */
  hasGroupedAssets: boolean;
  stitchingConfidence: number;
};

// ---------------------------------------------------------------------------
// Phase 4: Case / opportunity binding (extends CaseBindingResult)
// ---------------------------------------------------------------------------

export const CASE_BINDING_STATES_V2 = [
  "bound_case_from_active_context",
  "bound_case_from_strong_lookup",
  "weak_case_candidate",
  "multiple_case_candidates",
  "unresolved_case",
] as const;
export type CaseBindingStateV2 = (typeof CASE_BINDING_STATES_V2)[number];

export type CaseBindingResultV2 = {
  state: CaseBindingStateV2;
  caseId: string | null;
  caseLabel: string | null;
  confidence: number;
  candidates: Array<{ id: string; label: string; score: number }>;
  source: "active_context" | "strong_lookup" | "client_scoped_lookup" | "none";
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Phase 4: AI Review handoff boundary
// ---------------------------------------------------------------------------

export const REVIEW_HANDOFF_SIGNALS = [
  "contract_like_document",
  "multi_page_document_scan",
  "formal_policy_document",
  "dense_legal_text",
  "insurance_policy_attachment",
] as const;
export type ReviewHandoffSignal = (typeof REVIEW_HANDOFF_SIGNALS)[number];

export type ReviewHandoffRecommendation = {
  /** Whether image intake recommends handing off to AI Review. */
  recommended: boolean;
  signals: ReviewHandoffSignal[];
  confidence: number;
  /** What image intake was able to extract briefly (orientation only). */
  orientationSummary: string | null;
  /** Explanation shown to advisor. */
  advisorExplanation: string;
  /** True when handoff flag is enabled AND recommendation is confident. */
  handoffReady: boolean;
};

// ---------------------------------------------------------------------------
// Phase 5: Long-thread conversation reconstruction
// ---------------------------------------------------------------------------

export type ThreadAssetOrder = {
  assetId: string;
  /** Position in probable chronological order. Lower = earlier. */
  position: number;
  /** Whether this asset fully overlaps with the previous one (near-duplicate content). */
  overlapsWithPrevious: boolean;
};

export type MergedThreadFact = {
  factKey: string;
  factType: FactType;
  value: unknown;
  /** Which assets contributed to this fact. */
  sourceAssetIds: string[];
  confidence: number;
  observedVsInferred: "observed" | "inferred";
  /** Is this fact from the most recent / actionable part of the thread? */
  isLatestSignal: boolean;
};

export type ThreadReconstructionOutcome =
  | "full_thread"           // Confident reconstruction
  | "partial_thread"        // Some gaps, usable but incomplete
  | "ambiguous_thread"      // Cannot confidently reconstruct
  | "single_asset"          // Only one asset — no reconstruction needed
  | "duplicate_only";       // All assets are duplicates of each other

export type ThreadReconstructionResult = {
  outcome: ThreadReconstructionOutcome;
  orderedAssets: ThreadAssetOrder[];
  mergedFacts: MergedThreadFact[];
  /** The most recent actionable signal, if detectable. */
  latestActionableSignal: string | null;
  /** What is missing or unresolved in this thread. */
  unresolvedGaps: string[];
  reconstructionConfidence: number;
  reconstructionRationale: string;
  /** Original assetIds considered as duplicates within this thread. */
  suppressedDuplicateAssetIds: string[];
};

// ---------------------------------------------------------------------------
// Phase 5: Structured AI Review handoff payload contract
// ---------------------------------------------------------------------------

export type HandoffPayloadStatus =
  | "ready"       // Handoff payload is well-formed, ready to pass
  | "partial"     // Some fields uncertain but sufficient
  | "insufficient"; // Not enough info for safe handoff

export type ReviewHandoffPayload = {
  /** Unique ID for this handoff request. */
  handoffId: string;
  status: HandoffPayloadStatus;
  /** Source asset IDs being handed off. */
  sourceAssetIds: string[];
  /** Signals that triggered the handoff recommendation. */
  handoffReasons: string[];
  /** What image intake lane extracted orientationally. */
  orientationSummary: string | null;
  /** Classification input type that was determined. */
  detectedInputType: string | null;
  /** Client binding context (safe to pass). */
  bindingContext: {
    clientId: string | null;
    clientLabel: string | null;
    caseId: string | null;
    caseLabel: string | null;
    bindingConfidence: number;
  };
  /** Ambiguity notes for AI Review lane to be aware of. */
  ambiguityNotes: string[];
  /** Minimal metadata for AI Review entrypoint. */
  metadata: {
    sessionId: string;
    tenantId: string;
    userId: string;
    uploadedAt: Date;
  };
  /**
   * Explicit separation marker: image intake did NOT perform AI Review work.
   * AI Review lane must process this independently.
   */
  laneNote: "image_intake_lane_only_extracted_orientation";
};

// ---------------------------------------------------------------------------
// Phase 5: Advanced case/opportunity signal extraction
// ---------------------------------------------------------------------------

export const CASE_SIGNAL_STRENGTHS = ["strong", "moderate", "weak"] as const;
export type CaseSignalStrength = (typeof CASE_SIGNAL_STRENGTHS)[number];

export type CaseOpportunitySignal = {
  signalType:
    | "product_type_mention"
    | "bank_or_institution_mention"
    | "deadline_or_date_mention"
    | "existing_process_reference"
    | "financial_amount_hint"
    | "advisor_action_request"
    | "case_title_like_text";
  rawValue: string;
  normalizedValue: string | null;
  strength: CaseSignalStrength;
  evidenceText: string;
  sourceAssetId: string;
  /** This is for binding assist only — never for confident auto-pick. */
  bindingAssistOnly: true;
};

export type CaseSignalBundle = {
  signals: CaseOpportunitySignal[];
  /** Combined signal strength for this bundle. */
  overallStrength: CaseSignalStrength | "none";
  /** Human-readable summary for preview. */
  summary: string | null;
};

// ---------------------------------------------------------------------------
// Phase 5: Batch multimodal decision
// ---------------------------------------------------------------------------

export type BatchMultimodalStrategy = "per_asset" | "combined_pass" | "skip_all";

export type BatchMultimodalDecision = {
  strategy: BatchMultimodalStrategy;
  /** Asset IDs to include in combined pass (when strategy=combined_pass). */
  combinedPassAssetIds: string[];
  /** Asset IDs to process individually. */
  perAssetIds: string[];
  /** Asset IDs to skip (dead ends / duplicates / unsupported). */
  skipAssetIds: string[];
  costRationale: string;
  /** Estimated max vision calls for this decision. */
  estimatedVisionCalls: number;
};

// ---------------------------------------------------------------------------
// Phase 6: Cross-session thread reconstruction
// ---------------------------------------------------------------------------

/** Lightweight artifact stored in-process for cross-session reference. */
export type CrossSessionThreadArtifact = {
  artifactId: string;
  tenantId: string;
  userId: string;
  clientId: string | null;
  /** ISO timestamp of last update. */
  lastUpdatedAt: string;
  /** The thread facts from previous session(s). */
  priorMergedFacts: MergedThreadFact[];
  /** Latest actionable signal captured. */
  priorLatestSignal: string | null;
  /** Session IDs that contributed to this artifact. */
  sourceSessionIds: string[];
};

export type CrossSessionReconstructionResult = {
  /** Was a prior artifact found and used? */
  hasPriorContext: boolean;
  /** Prior facts from previous sessions. */
  priorMergedFacts: MergedThreadFact[];
  /** Current session's facts. */
  currentMergedFacts: MergedThreadFact[];
  /** What changed vs prior context. */
  priorVsLatestDelta: string | null;
  /** Combined confidence in the cross-session linkage. */
  crossSessionConfidence: number;
  /** Gaps that couldn't be resolved cross-session. */
  unresolvedGaps: string[];
};

// ---------------------------------------------------------------------------
// Phase 8: AI Review handoff lifecycle status
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of an AI Review handoff after queue submit.
 * Maps onto `ContractProcessingStatus` from the review pipeline
 * plus image-intake-specific states.
 */
export type HandoffLifecycleStatus =
  | "prepared"       // Payload built, not yet submitted
  | "submitted"      // Row created in contractUploadReviews (uploaded)
  | "queued"         // Row picked up by worker (processing)
  | "processing"     // Worker is extracting / running pipeline
  | "done"           // Processing complete (extracted / review_required)
  | "failed"         // Pipeline failed
  | "unavailable"    // Status cannot be determined (safe degradation)
  | "unknown";       // reviewRowId not available / no DB lookup possible

export type HandoffLifecycleFeedback = {
  status: HandoffLifecycleStatus;
  /** The review row ID in contractUploadReviews, if available. */
  reviewRowId: string | null;
  /** Human-readable status label for preview display. */
  statusLabel: string;
  /** Optional processing stage hint (from processingStage column). */
  processingStageHint: string | null;
  /** Whether to show a refresh/poll suggestion in the UI. */
  suggestRefresh: boolean;
  /** ISO timestamp of last status check. */
  checkedAt: string;
};

// ---------------------------------------------------------------------------
// Phase 8: Intent-assist cache
// ---------------------------------------------------------------------------

export type IntentAssistCacheStatus =
  | "cache_hit"
  | "cache_miss"
  | "cache_stale"
  | "cache_bypassed";

export type IntentAssistCacheResult = {
  cacheStatus: IntentAssistCacheStatus;
  finding: import("./types").IntentChangeFinding | null;
  cachedAt: string | null;
  cacheKey: string | null;
};

// ---------------------------------------------------------------------------
// Phase 8: Household / multi-client binding
// ---------------------------------------------------------------------------

export type HouseholdBindingState =
  | "single_client"          // Unambiguous single client
  | "household_detected"     // Multiple related clients found; active context takes priority
  | "household_ambiguous"    // Multiple clients, no clear priority — ambiguity outcome
  | "no_household";          // No household relation found

export type HouseholdMember = {
  clientId: string;
  clientLabel: string;
  role: string | null;
  householdId: string;
  householdName: string | null;
};

export type HouseholdBindingResult = {
  state: HouseholdBindingState;
  /** Primary resolved client (if unambiguous or active context wins). */
  primaryClientId: string | null;
  primaryClientLabel: string | null;
  /** All household members found. */
  householdMembers: HouseholdMember[];
  confidence: number;
  /** Hint for preview — why ambiguity was kept. */
  ambiguityNote: string | null;
};

// ---------------------------------------------------------------------------
// Phase 8: Document multi-image set result
// ---------------------------------------------------------------------------

export type DocumentSetDecision =
  | "consolidated_document_facts"  // Related pages merged into one fact bundle
  | "review_handoff_candidate"     // Review-like document set → handoff recommended
  | "supporting_reference_set"     // Supporting/reference multi-image → no structured intake
  | "mixed_document_set"           // Mixed types; process independently
  | "insufficient_for_merge";      // Not enough confidence to merge

export type DocumentMultiImageResult = {
  decision: DocumentSetDecision;
  /** Merged facts (when consolidated). */
  mergedFactBundle: import("./types").ExtractedFactBundle | null;
  /** Summary of detected document set context. */
  documentSetSummary: string | null;
  confidence: number;
  /** Asset IDs included in this set. */
  assetIds: string[];
};

// ---------------------------------------------------------------------------
// Phase 6: Handoff submit result
// ---------------------------------------------------------------------------

export type HandoffSubmitStatus =
  | "submitted"
  | "skipped_no_confirm"
  | "skipped_flag_disabled"
  | "skipped_tenant_feature_disabled"
  | "skipped_no_payload"
  | "failed";

export type HandoffSubmitResult = {
  status: HandoffSubmitStatus;
  handoffId: string | null;
  reason: string;
  /** Action reference for audit. */
  auditRef: string | null;
};

// ---------------------------------------------------------------------------
// Phase 6: Intent change detection
// ---------------------------------------------------------------------------

export type IntentChangeStatus =
  | "stable"          // No change detected
  | "changed"         // Clear intent change
  | "partially_changed" // Some aspects changed, others stable
  | "ambiguous";      // Cannot determine with confidence

export type IntentChangeFinding = {
  status: IntentChangeStatus;
  /** The most recent / actionable intent. */
  currentIntent: string | null;
  /** Prior intent that may be superseded. */
  priorIntent: string | null;
  /** Human-readable explanation of the change. */
  changeExplanation: string | null;
  confidence: number;
  /** Whether the prior intent should be treated as superseded. */
  priorSuperseded: boolean;
};

// ---------------------------------------------------------------------------
// O) Constants
// ---------------------------------------------------------------------------

/** MIME types accepted for image intake. */
export const SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

/** Max single image size in bytes (20 MB). */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** Max images per single intake batch (assistant paste/picker; document set + identity flow). */
export const MAX_IMAGES_PER_INTAKE = 4;

/**
 * Canonical intents that image intake can propose.
 * This restricts the action surface to prevent image lane from overstepping.
 */
export const IMAGE_INTAKE_ALLOWED_INTENTS: ReadonlySet<CanonicalIntentType> = new Set([
  "create_task",
  "create_followup",
  "schedule_meeting",
  "create_note",
  "create_internal_note",
  "create_client_request",
  "update_contact",
  "attach_document",
  "draft_portal_message",
  "general_chat",
  "create_contact",
]);

/**
 * Write actions that image intake is allowed to produce.
 * Maps to the canonical write adapter surface — no new write engine.
 */
export const IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS: ReadonlySet<WriteActionType> = new Set([
  "createTask",
  "createFollowUp",
  "scheduleCalendarEvent",
  "createMeetingNote",
  "createInternalNote",
  "createClientRequest",
  "createContact",
  "updateContact",
  "attachDocumentToClient",
  "attachDocumentToOpportunity",
  "draftClientPortalMessage",
]);
