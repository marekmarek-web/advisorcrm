/**
 * AI Photo / Image Intake — public API.
 *
 * Standalone capability lane within the AI assistant.
 * NOT part of AI Review (PDF/contract pipeline).
 */

// --- Domain types & contracts ---
// Phase 5 types
export type {
  ThreadAssetOrder,
  MergedThreadFact,
  ThreadReconstructionOutcome,
  ThreadReconstructionResult,
  HandoffPayloadStatus,
  ReviewHandoffPayload,
  CaseSignalStrength,
  CaseOpportunitySignal,
  CaseSignalBundle,
  BatchMultimodalStrategy,
  BatchMultimodalDecision,
} from "./types";
export { CASE_SIGNAL_STRENGTHS } from "./types";

export type {
  ImageInputType,
  ImageInputSubtype,
  ImageOutputMode,
  NormalizedImageAsset,
  ImageQualityLevel,
  ImagePreflightResult,
  LaneDecision,
  LaneDecisionResult,
  InputClassificationResult,
  InputClassificationResultV2,
  ClientBindingState,
  ClientBindingResult,
  CaseBindingResult,
  CaseBindingStateV2,
  CaseBindingResultV2,
  EvidenceReference,
  FactType,
  ExtractedImageFact,
  ExtractedFactBundle,
  MultimodalFactItem,
  MultimodalCombinedPassResult,
  StitchingDecision,
  StitchedAssetGroup,
  MultiImageStitchingResult,
  ReviewHandoffSignal,
  ReviewHandoffRecommendation,
  ImageIntakeActionCandidate,
  ImageIntakeActionPlan,
  ImageIntakeRequest,
  ImageIntakeResponse,
  ImageIntakePreviewPayload,
  ArchiveOnlyResult,
  AmbiguousResult,
  ImageIntakeTrace,
} from "./types";

export {
  IMAGE_INPUT_TYPES,
  IMAGE_INPUT_SUBTYPES,
  IMAGE_OUTPUT_MODES,
  IMAGE_QUALITY_LEVELS,
  LANE_DECISIONS,
  CLIENT_BINDING_STATES,
  FACT_TYPES,
  SUPPORTED_IMAGE_MIMES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_INTAKE,
  IMAGE_INTAKE_ALLOWED_INTENTS,
  IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS,
  STITCHING_DECISIONS,
  CASE_BINDING_STATES_V2,
  REVIEW_HANDOFF_SIGNALS,
  emptyFactBundle,
  emptyActionPlan,
} from "./types";

// --- Preflight ---
export { runImagePreflight, runBatchPreflight, purgePreflightCache } from "./preflight";
export type { BatchPreflightResult } from "./preflight";

// --- Guardrails ---
export {
  enforceImageIntakeGuardrails,
  isValidTerminalOutputMode,
  safeOutputModeForUncertainInput,
} from "./guardrails";
export type { GuardrailVerdict } from "./guardrails";

// --- Classifier v1 ---
export { classifyImageInput, classifyBatch } from "./classifier";
export type { ClassifierDecision } from "./classifier";

// --- Planner v1 + v2 + v3 ---
export { buildActionPlanV1, buildActionPlanV2, buildActionPlanV3 } from "./planner";

// --- Multi-image stitching v1 (Phase 4) ---
export {
  computeStitchingGroups,
  getPrimaryAssetIds,
  buildStitchingSummary,
} from "./stitching";

// --- AI Review handoff boundary v1 (Phase 4) ---
export { evaluateReviewHandoff } from "./review-handoff";

// --- Phase 5 modules ---
export { reconstructThread, buildThreadSummaryLines } from "./thread-reconstruction";
export { buildReviewHandoffPayload, buildHandoffPreviewNote } from "./handoff-payload";
export { decideBatchMultimodalStrategy, buildBatchCostSummary } from "./batch-multimodal";
export { extractCaseSignals, mergeCaseSignalBundles } from "./case-signal-extraction";

// --- Phase 5 feature flags ---
export {
  isImageIntakeEnabledForUser,
  isImageIntakeMultimodalEnabledForUser,
  isImageIntakeThreadReconstructionEnabledForUser,
  isImageIntakeReviewHandoffEnabledForUser,
  isImageIntakeCaseSignalEnabledForUser,
  getImageIntakeUserRolloutSummary,
} from "./feature-flag";

// --- Feature flag ---
export {
  isImageIntakeEnabled,
  isImageIntakeMultimodalEnabled,
  isImageIntakeStitchingEnabled,
  isImageIntakeReviewHandoffEnabled,
  getImageIntakeClassifierConfig,
  getImageIntakeMultimodalConfig,
  getImageIntakeFlagState,
  getImageIntakeMultimodalFlagState,
  getImageIntakeStitchingFlagState,
  getImageIntakeReviewHandoffFlagState,
  getImageIntakeFlagSummary,
} from "./feature-flag";

// --- Multimodal combined pass (Phase 3) ---
export { runCombinedMultimodalPass, shouldRunMultimodalPass } from "./multimodal";
export type { MultimodalPassDecision } from "./multimodal";

// --- Fact extractor (Phase 3) ---
export {
  extractFactsFromMultimodalPass,
  buildSupportingReferenceFacts,
  buildUnusableFacts,
  buildFactsSummaryLines,
} from "./extractor";

// --- CRM-aware binding v2 (Phase 3) + case binding v2 (Phase 4) ---
export { resolveClientBindingV2, resolveCaseBindingV2, toCaseBindingResult } from "./binding-v2";

// --- Draft reply preview (Phase 3) ---
export {
  checkDraftReplyEligibility,
  buildDraftReplyPreview,
  tryBuildDraftReply,
} from "./draft-reply";
export type { DraftReplyEligibility } from "./draft-reply";

// --- Orchestrator ---
export {
  processImageIntake,
  mapToExecutionPlan,
  mapToPreviewItems,
  buildImageIntakePreview,
} from "./orchestrator";
export type { ImageIntakeOrchestratorResult } from "./orchestrator";

// --- Response mapper ---
export { mapImageIntakeToAssistantResponse } from "./response-mapper";

// --- Route handler ---
export {
  parseImageAssetsFromBody,
  handleImageIntakeFromChatRoute,
} from "./route-handler";
export type { ImageAssetInput } from "./route-handler";
