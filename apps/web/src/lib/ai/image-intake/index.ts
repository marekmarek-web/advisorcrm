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

// Phase 6 types
export type {
  CrossSessionThreadArtifact,
  CrossSessionReconstructionResult,
  HandoffSubmitStatus,
  HandoffSubmitResult,
  IntentChangeStatus,
  IntentChangeFinding,
} from "./types";

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
export { buildActionPlanV1, buildActionPlanV2, buildActionPlanV3, buildActionPlanV4 } from "./planner";

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

// --- Phase 6 modules ---
export { executeBatchMultimodalStrategy } from "./combined-multimodal-execution";
export type { CombinedMultimodalExecutionResult } from "./combined-multimodal-execution";
export { resolveCaseBindingWithSignals } from "./binding-v2";
export {
  persistThreadArtifact,
  reconstructCrossSessionThread,
  clearAllArtifacts,
  mergePersistedArtifacts,
} from "./cross-session-reconstruction";
export {
  isHandoffConfirmAction,
  submitHandoffAfterConfirm,
  buildHandoffSubmitAction,
} from "./handoff-submit";
export { detectIntentChange, buildIntentChangeSummary } from "./intent-change-detection";

// --- Phase 6 feature flags ---
export {
  isImageIntakeCombinedMultimodalEnabledForUser,
  isImageIntakeCrossSessionEnabledForUser,
  isImageIntakeHandoffSubmitEnabledForUser,
} from "./feature-flag";

// --- Phase 7 modules ---
export {
  getImageIntakeConfig,
  getImageIntakeConfigSummary,
  setImageIntakeConfigOverride,
  clearImageIntakeConfigOverride,
  clearAllImageIntakeConfigOverrides,
} from "./image-intake-config";
export type { ImageIntakeConfigKey, ImageIntakeResolvedConfig } from "./image-intake-config";
export { runMultiImageCombinedPass } from "./multimodal";
export { runIntentChangeAssist } from "./intent-change-assist";
export { submitToAiReviewQueue } from "./handoff-queue-integration";

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
  getImageIntakeRuntimeHealthSummary,
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

// --- Explicit intent parser ---
export { parseExplicitIntent, textSignalsCrmExtractionIntent, textSignalsPaymentIntent, textSignalsNoteOrTaskIntent } from "./explicit-intent-parser";
export type { ParsedExplicitIntent, ExplicitIntentVerb, IntentTargetDestination, IntentTargetOperation } from "./explicit-intent-parser";

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
  parseImageAssetsFromBodyResult,
  handleImageIntakeFromChatRoute,
} from "./route-handler";
export type { ImageAssetInput } from "./route-handler";
