/**
 * AI Photo / Image Intake — public API.
 *
 * Standalone capability lane within the AI assistant.
 * NOT part of AI Review (PDF/contract pipeline).
 */

// --- Domain types & contracts ---
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
  ClientBindingState,
  ClientBindingResult,
  CaseBindingResult,
  EvidenceReference,
  FactType,
  ExtractedImageFact,
  ExtractedFactBundle,
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

// --- Planner v1 ---
export { buildActionPlanV1 } from "./planner";

// --- Feature flag ---
export {
  isImageIntakeEnabled,
  getImageIntakeClassifierConfig,
  getImageIntakeFlagState,
} from "./feature-flag";

// --- Orchestrator ---
export {
  processImageIntake,
  mapToExecutionPlan,
  mapToPreviewItems,
  buildImageIntakePreview,
  resolveClientBindingV1,
  resolveCaseBindingV1,
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
