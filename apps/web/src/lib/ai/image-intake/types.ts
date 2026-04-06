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
  source: "session_context" | "ui_context" | "image_signal" | "crm_match" | "none";
  warnings: string[];
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
  };
}

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

/** Max images per single intake batch. */
export const MAX_IMAGES_PER_INTAKE = 10;

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
  "attach_document",
  "draft_portal_message",
  "general_chat",
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
  "attachDocumentToClient",
  "attachDocumentToOpportunity",
  "draftClientPortalMessage",
]);
