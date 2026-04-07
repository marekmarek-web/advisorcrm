/**
 * AI Photo / Image Intake — orchestration adapter (Phase 3).
 *
 * Phase 3 additions over Phase 2:
 * - multimodal combined pass (classification upgrade + fact extraction) as escalation
 * - fact extraction v1 from multimodal output (no stub)
 * - CRM-aware binding v2 (name signal from image)
 * - draft reply preview v1 (communication screenshots only)
 * - richer trace with extraction source + multimodal stats
 *
 * Cost rules:
 * - dead ends exit before any model call
 * - supporting/reference images skip multimodal
 * - multimodal runs at most once per asset per request
 * - classifier output reused for extraction, planner, binding, preview
 *
 * Canonical action surface is the ONLY write path.
 * No new write engine.
 */

import { randomUUID } from "crypto";
import type { StepPreviewItem } from "../assistant-execution-ui";
import type { ExecutionPlan, ExecutionStep, CanonicalIntentType } from "../assistant-domain-model";
import type { AssistantSession, ActiveContext } from "../assistant-session";

import type {
  ImageIntakeRequest,
  ImageIntakeResponse,
  ImageIntakeTrace,
  ImageIntakeActionPlan,
  ImageIntakePreviewPayload,
  NormalizedImageAsset,
  LaneDecisionResult,
  InputClassificationResult,
  ClientBindingResult,
  CaseBindingResult,
  ExtractedFactBundle,
  ImageOutputMode,
  MultimodalCombinedPassResult,
  MultiImageStitchingResult,
  ReviewHandoffRecommendation,
  CaseBindingResultV2,
} from "./types";
import { emptyFactBundle, emptyActionPlan } from "./types";
import { runBatchPreflight } from "./preflight";
import { enforceImageIntakeGuardrails } from "./guardrails";
import { classifyBatch } from "./classifier";
import { buildActionPlanV3 } from "./planner";
import {
  shouldRunMultimodalPass,
  runCombinedMultimodalPass,
} from "./multimodal";
import {
  extractFactsFromMultimodalPass,
  buildSupportingReferenceFacts,
  buildUnusableFacts,
} from "./extractor";
import { resolveClientBindingV2, resolveCaseBindingV2, toCaseBindingResult } from "./binding-v2";
import { tryBuildDraftReply } from "./draft-reply";
import {
  isImageIntakeMultimodalEnabled,
  isImageIntakeStitchingEnabled,
  isImageIntakeReviewHandoffEnabled,
  isImageIntakeThreadReconstructionEnabledForUser,
  isImageIntakeCaseSignalEnabledForUser,
  getImageIntakeFlagSummary,
} from "./feature-flag";
import { computeStitchingGroups, getPrimaryAssetIds } from "./stitching";
import { evaluateReviewHandoff } from "./review-handoff";
import { reconstructThread } from "./thread-reconstruction";
import { buildReviewHandoffPayload, buildHandoffPreviewNote } from "./handoff-payload";
import { decideBatchMultimodalStrategy } from "./batch-multimodal";
import { executeBatchMultimodalStrategy } from "./combined-multimodal-execution";
import { extractCaseSignals, mergeCaseSignalBundles } from "./case-signal-extraction";
import { resolveCaseBindingWithSignals } from "./binding-v2";
import { reconstructCrossSessionThread, persistThreadArtifact } from "./cross-session-reconstruction";
import { detectIntentChange, buildIntentChangeSummary } from "./intent-change-detection";
import {
  isImageIntakeCombinedMultimodalEnabledForUser,
  isImageIntakeCrossSessionEnabledForUser,
} from "./feature-flag";
import type {
  ThreadReconstructionResult,
  ReviewHandoffPayload,
  CaseSignalBundle,
  BatchMultimodalDecision,
  CrossSessionReconstructionResult,
  IntentChangeFinding,
} from "./types";

// ---------------------------------------------------------------------------
// Lane decision
// ---------------------------------------------------------------------------

function decideLane(_assets: NormalizedImageAsset[]): LaneDecisionResult {
  return {
    lane: "image_intake",
    confidence: 1.0,
    reason: "Image input routed to image intake lane.",
    handoffReason: null,
  };
}

// ---------------------------------------------------------------------------
// Execution plan / preview mapping (unchanged from Phase 2)
// ---------------------------------------------------------------------------

const INTENT_TO_WRITE: Partial<Record<CanonicalIntentType, string>> = {
  create_task: "createTask",
  create_followup: "createFollowUp",
  schedule_meeting: "scheduleCalendarEvent",
  create_note: "createMeetingNote",
  create_internal_note: "createInternalNote",
  create_client_request: "createClientRequest",
  attach_document: "attachDocumentToClient",
  draft_portal_message: "draftClientPortalMessage",
};

export function mapToExecutionPlan(
  intakeId: string,
  actionPlan: ImageIntakeActionPlan,
  clientId: string | null,
  opportunityId: string | null,
): ExecutionPlan {
  const steps: ExecutionStep[] = actionPlan.recommendedActions.map((action, idx) => ({
    stepId: `${intakeId}_s${idx}`,
    action: (action.writeAction ?? INTENT_TO_WRITE[action.intentType] ?? "createInternalNote") as any,
    params: {
      ...action.params,
      contactId: clientId,
      opportunityId,
      _imageIntakeSource: intakeId,
    },
    label: action.label,
    requiresConfirmation: true,
    isReadOnly: false,
    dependsOn: [],
    status: "requires_confirmation" as const,
    result: null,
  }));

  return {
    planId: intakeId,
    intentType: actionPlan.recommendedActions[0]?.intentType ?? "general_chat",
    productDomain: null,
    contactId: clientId,
    opportunityId,
    steps,
    status: steps.length > 0 ? "awaiting_confirmation" : "completed",
    createdAt: new Date(),
  };
}

export function mapToPreviewItems(plan: ExecutionPlan): StepPreviewItem[] {
  return plan.steps.map((step) => ({
    stepId: step.stepId,
    label: step.label,
    action: step.label,
    description: `Image intake: ${step.action}`,
    preflightStatus: "ready" as const,
  }));
}

// ---------------------------------------------------------------------------
// Preview payload
// ---------------------------------------------------------------------------

export function buildImageIntakePreview(
  intakeId: string,
  classification: InputClassificationResult | null,
  clientBinding: ClientBindingResult,
  caseBinding: CaseBindingResult,
  factBundle: ExtractedFactBundle,
  actionPlan: ImageIntakeActionPlan,
): ImageIntakePreviewPayload {
  const writeReady =
    actionPlan.recommendedActions.length > 0 &&
    !actionPlan.needsAdvisorInput &&
    (clientBinding.state === "bound_client_confident" || clientBinding.state === "bound_case_confident");

  return {
    intakeId,
    outputMode: actionPlan.outputMode,
    inputType: classification?.inputType ?? "mixed_or_uncertain_image",
    clientLabel: clientBinding.clientLabel,
    caseLabel: caseBinding.caseLabel,
    summary: actionPlan.whyThisAction || "Image intake zpracování.",
    factsSummary: factBundle.facts
      .filter((f) => f.value !== null)
      .slice(0, 6)
      .map((f) => `${f.factKey}: ${String(f.value).slice(0, 100)}`),
    uncertainties: [
      ...factBundle.ambiguityReasons,
      ...(classification?.uncertaintyFlags ?? []),
    ],
    recommendedActions: actionPlan.recommendedActions.map((a) => ({
      label: a.label,
      action: a.intentType,
      reason: a.reason,
    })),
    writeReady,
    warnings: [...clientBinding.warnings, ...actionPlan.safetyFlags],
  };
}

// ---------------------------------------------------------------------------
// Main orchestration (Phase 3)
// ---------------------------------------------------------------------------

export type ImageIntakeOrchestratorResult = {
  response: ImageIntakeResponse;
  executionPlan: ExecutionPlan | null;
  previewPayload: ImageIntakePreviewPayload;
  classifierUsedModel: boolean;
  multimodalUsed: boolean;
  multimodalResult: MultimodalCombinedPassResult | null;
  /** Phase 4: stitching result (null when stitching is disabled or single asset). */
  stitchingResult: MultiImageStitchingResult | null;
  /** Phase 4: review handoff recommendation (null when handoff is disabled or not applicable). */
  reviewHandoff: ReviewHandoffRecommendation | null;
  /** Phase 4: case/opportunity binding v2 result. */
  caseBindingV2: CaseBindingResultV2 | null;
  /** Phase 5: thread reconstruction result. */
  threadReconstruction: ThreadReconstructionResult | null;
  /** Phase 5: structured AI Review handoff payload. */
  handoffPayload: ReviewHandoffPayload | null;
  /** Phase 5: case/opportunity signals bundle. */
  caseSignals: CaseSignalBundle | null;
  /** Phase 5: batch multimodal decision (when stitching active). */
  batchDecision: BatchMultimodalDecision | null;
  /** Phase 6: combined multimodal execution result (null when not executed). */
  combinedMultimodalResult: import("./combined-multimodal-execution").CombinedMultimodalExecutionResult | null;
  /** Phase 6: cross-session thread reconstruction result. */
  crossSessionReconstruction: CrossSessionReconstructionResult | null;
  /** Phase 6: intent change detection finding. */
  intentChange: IntentChangeFinding | null;
};

export async function processImageIntake(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  activeContext?: ActiveContext | null,
): Promise<ImageIntakeOrchestratorResult> {
  const startTime = Date.now();
  const intakeId = `img_${randomUUID().slice(0, 12)}`;

  const effectiveRequest: ImageIntakeRequest = {
    ...request,
    activeClientId:
      request.activeClientId ??
      (typeof activeContext?.clientId === "string" ? activeContext.clientId : null),
    activeOpportunityId:
      request.activeOpportunityId ??
      (typeof activeContext?.opportunityId === "string" ? activeContext.opportunityId : null),
  };

  // 1. Preflight (deterministic, free)
  const batchPreflight = runBatchPreflight(request.assets, request.sessionId);
  const primaryPreflight = batchPreflight.assetResults[0]?.result ?? {
    eligible: false,
    qualityLevel: "unusable" as const,
    isDuplicate: false,
    mimeSupported: false,
    sizeWithinLimits: false,
    rejectReason: "no_assets",
    warnings: ["Žádné obrázky."],
  };

  // 2. Lane decision
  const laneDecision = decideLane(request.assets);

  // 3. Multi-image stitching (Phase 4 — metadata-only, free)
  const stitchingEnabled = isImageIntakeStitchingEnabled();
  const threadReconstructionEnabled = isImageIntakeThreadReconstructionEnabledForUser(request.userId);
  const caseSignalEnabled = isImageIntakeCaseSignalEnabledForUser(request.userId);
  let stitchingResult: MultiImageStitchingResult | null = null;
  let primaryAssets = request.assets;
  const stitchingClassMap = new Map<string, InputClassificationResult | null>();

  if (stitchingEnabled && request.assets.length > 1) {
    // Classify each asset cheaply (deterministic only — skip model for stitching pass)
    for (const asset of request.assets) {
      const { classifyImageInput } = await import("./classifier");
      const dec = await classifyImageInput(asset, request.accompanyingText);
      stitchingClassMap.set(asset.assetId, dec.earlyExit ? null : dec.result);
    }
    stitchingResult = computeStitchingGroups(request.assets, stitchingClassMap);
    // Only process primary (non-duplicate) assets downstream
    const primaryIds = new Set(getPrimaryAssetIds(stitchingResult));
    primaryAssets = request.assets.filter((a) => primaryIds.has(a.assetId));
  }

  // 4. Classifier v1 (cheap-first: deterministic + optional text)
  // Run over primary assets only (duplicates excluded by stitching)
  let classification: InputClassificationResult | null = null;
  let classifierUsedModel = false;
  let earlyExit = false;

  if (batchPreflight.eligible) {
    const eligibleAssets = batchPreflight.assetResults
      .filter((r) => r.result.eligible && !r.result.isDuplicate)
      .map((r) => primaryAssets.find((a) => a.assetId === r.assetId)!)
      .filter(Boolean);

    if (eligibleAssets.length > 0) {
      const classifierDecision = await classifyBatch(eligibleAssets, request.accompanyingText);
      classification = classifierDecision.result;
      classifierUsedModel = classifierDecision.usedModel;
      earlyExit = classifierDecision.earlyExit;
    }
  }

  // 5. Early exits for unusable / no eligible assets
  if (earlyExit || !batchPreflight.eligible || !classification) {
    const earlyPlan = emptyActionPlan("no_action_archive_only");
    const earlyFacts = buildUnusableFacts();
    const binding: ClientBindingResult = {
      state: "insufficient_binding", clientId: null, clientLabel: null,
      confidence: 0, candidates: [], source: "none", warnings: [],
    };
    const caseBinding: CaseBindingResult = {
      state: "insufficient_binding", caseId: null, caseLabel: null,
      confidence: 0, candidates: [], source: "none",
    };
    const earlyPreview = buildImageIntakePreview(intakeId, classification, binding, caseBinding, earlyFacts, earlyPlan);
    const trace: ImageIntakeTrace = {
      intakeId, sessionId: request.sessionId,
      assetIds: request.assets.map((a) => a.assetId),
      laneDecision: laneDecision.lane,
      inputType: classification?.inputType ?? null,
      outputMode: "no_action_archive_only",
      clientBindingState: "insufficient_binding",
      factCount: 0, actionCount: 0, writeReady: false,
      guardrailsTriggered: [], durationMs: Date.now() - startTime, timestamp: new Date(),
    };
    return {
      response: { intakeId, laneDecision, preflight: primaryPreflight, classification, clientBinding: binding, caseBinding, factBundle: earlyFacts, actionPlan: earlyPlan, previewSteps: [], trace },
      executionPlan: null, previewPayload: earlyPreview,
      classifierUsedModel, multimodalUsed: false, multimodalResult: null,
      stitchingResult, reviewHandoff: null, caseBindingV2: null,
      threadReconstruction: null, handoffPayload: null, caseSignals: null, batchDecision: null,
      combinedMultimodalResult: null, crossSessionReconstruction: null, intentChange: null,
    };
  }

  // 6. Multimodal combined pass (escalation — Phase 3)
  // One call: classification upgrade + fact extraction + client name signal
  const primaryAsset = primaryAssets.find(
    (a) => batchPreflight.assetResults.find((r) => r.assetId === a.assetId && r.result.eligible)
  );
  const hasStorageUrl = Boolean(primaryAsset?.storageUrl);
  const multimodalEnabled = isImageIntakeMultimodalEnabled();

  let multimodalResult: MultimodalCombinedPassResult | null = null;
  let multimodalUsed = false;
  let factBundle: ExtractedFactBundle = emptyFactBundle();

  if (shouldRunMultimodalPass(classification.inputType, classification.confidence, earlyExit, primaryAsset?.storageUrl ?? null, multimodalEnabled)) {
    const passDecision = await runCombinedMultimodalPass(
      primaryAsset!.storageUrl!,
      classification.inputType,
      request.accompanyingText,
    );
    multimodalResult = passDecision.result;
    multimodalUsed = true;

    // Upgrade classification if multimodal is more confident
    if (multimodalResult.confidence > classification.confidence + 0.1) {
      classification = {
        ...classification,
        inputType: multimodalResult.inputType,
        confidence: multimodalResult.confidence,
        uncertaintyFlags: multimodalResult.ambiguityReasons.length > 0 ? ["multimodal_uncertain"] : [],
      };
    }

    // Extract facts from multimodal output (no extra call)
    factBundle = extractFactsFromMultimodalPass(
      multimodalResult,
      primaryAsset?.assetId ?? intakeId,
    );
  } else if (classification.inputType === "supporting_reference_image") {
    // Template facts for supporting/reference (no model call)
    factBundle = buildSupportingReferenceFacts(primaryAsset?.assetId ?? intakeId);
  }

  // 7. CRM-aware binding v2 (uses name signal from multimodal if available)
  const nameSignal = multimodalResult?.possibleClientNameSignal ?? null;
  const clientBinding = await resolveClientBindingV2(effectiveRequest, session, nameSignal);

  // 8. Case/opportunity binding v2 (Phase 4 — DB lookup when client is known)
  const resolvedClientId = clientBinding.clientId;
  const caseBindingV2 = await resolveCaseBindingV2(effectiveRequest, session, resolvedClientId);
  const caseBinding = toCaseBindingResult(caseBindingV2);

  // 9. Review handoff recommendation (Phase 4 — no model call)
  const handoffFlagEnabled = isImageIntakeReviewHandoffEnabled();
  const reviewHandoff = evaluateReviewHandoff(classification, factBundle, handoffFlagEnabled);

  // Phase 5: Thread reconstruction (for grouped threads when flag enabled)
  let threadReconstruction: ThreadReconstructionResult | null = null;
  let batchDecision: BatchMultimodalDecision | null = null;

  if (stitchingResult && threadReconstructionEnabled) {
    const groupedGroup = stitchingResult.groups.find(
      (g) => g.decision === "grouped_thread" || g.decision === "grouped_related",
    );
    if (groupedGroup && groupedGroup.assetIds.length >= 2) {
      // Per-asset fact bundles (current run only has one primary asset)
      const perAssetBundles = new Map<string, ExtractedFactBundle>();
      if (primaryAsset) perAssetBundles.set(primaryAsset.assetId, factBundle);
      threadReconstruction = reconstructThread(groupedGroup, request.assets, perAssetBundles);
    }

    // Phase 5: Batch multimodal decision
    const existingMultimodalResults = new Map<string, MultimodalCombinedPassResult | null>();
    if (primaryAsset && multimodalResult) {
      existingMultimodalResults.set(primaryAsset.assetId, multimodalResult);
    }
    const firstGroup = stitchingResult.groups[0];
    if (firstGroup) {
      batchDecision = decideBatchMultimodalStrategy(
        firstGroup,
        request.assets,
        stitchingClassMap,
        existingMultimodalResults,
        isImageIntakeMultimodalEnabled(),
      );
    }
  }

  // Phase 5: Advanced case signal extraction (from fact bundle — no model call)
  let caseSignals: CaseSignalBundle | null = null;
  if (caseSignalEnabled && factBundle.facts.length > 0) {
    caseSignals = extractCaseSignals(factBundle, classification, primaryAsset?.assetId ?? intakeId);
  }

  // Phase 6: Signal-aware case binding (replaces plain resolveCaseBindingV2 when signals available)
  let finalCaseBindingV2 = caseBindingV2;
  if (caseSignals && caseSignals.signals.length > 0 && caseBindingV2.state === "multiple_case_candidates") {
    finalCaseBindingV2 = await resolveCaseBindingWithSignals(
      effectiveRequest,
      session,
      resolvedClientId,
      caseSignals,
    );
  }
  const finalCaseBinding = toCaseBindingResult(finalCaseBindingV2);

  // Phase 6: Combined multimodal execution (when decision says combined_pass + flag enabled)
  let combinedMultimodalResult: import("./combined-multimodal-execution").CombinedMultimodalExecutionResult | null = null;
  const combinedMultimodalEnabled = isImageIntakeCombinedMultimodalEnabledForUser(effectiveRequest.userId ?? "");
  if (batchDecision && batchDecision.strategy === "combined_pass" && combinedMultimodalEnabled) {
    combinedMultimodalResult = await executeBatchMultimodalStrategy(
      batchDecision,
      request.assets,
      request.accompanyingText ?? null,
    );
    // Merge combined pass facts into main factBundle if execution succeeded
    if (combinedMultimodalResult.strategy === "combined_pass" && combinedMultimodalResult.groupFactBundle) {
      factBundle = combinedMultimodalResult.groupFactBundle;
    }
  }

  // Phase 6: Cross-session thread reconstruction (when enabled + client known)
  let crossSessionReconstruction: CrossSessionReconstructionResult | null = null;
  const crossSessionEnabled = isImageIntakeCrossSessionEnabledForUser(effectiveRequest.userId ?? "");
  if (crossSessionEnabled && threadReconstruction) {
    crossSessionReconstruction = reconstructCrossSessionThread(
      effectiveRequest.tenantId,
      clientBinding.clientId ?? null,
      intakeId,
      threadReconstruction.mergedFacts,
    );
    // Persist artifact for future sessions
    if (clientBinding.clientId) {
      persistThreadArtifact(
        effectiveRequest.tenantId,
        effectiveRequest.userId ?? "",
        clientBinding.clientId,
        intakeId,
        threadReconstruction.mergedFacts,
        threadReconstruction.latestActionableSignal,
      );
    }
  }

  // Phase 6: Intent change detection (when thread reconstruction has multiple assets)
  let intentChange: IntentChangeFinding | null = null;
  if (threadReconstruction && request.assets.length >= 2) {
    intentChange = detectIntentChange(
      threadReconstruction.mergedFacts,
      request.assets.length >= 2,
    );
  }

  // Phase 5: Structured handoff payload (when handoff recommended)
  const handoffPayload = reviewHandoff?.recommended
    ? buildReviewHandoffPayload(
        reviewHandoff,
        classification,
        clientBinding,
        finalCaseBindingV2,
        factBundle,
        primaryAssets,
        request,
      )
    : null;

  // 10. Draft reply (preview-only, communication screenshots + confident binding only)
  const draftReplyText = tryBuildDraftReply(
    classification.inputType,
    clientBinding,
    factBundle,
    multimodalResult?.draftReplyIntent ?? null,
  );

  // 11. Action planning v3 (Phase 4 — uses extracted facts + handoff recommendation)
  const actionPlan = buildActionPlanV3(classification, clientBinding, factBundle, draftReplyText, reviewHandoff);

  // 12. Guardrails (unchanged from Phase 1)
  const guardrailVerdict = enforceImageIntakeGuardrails(
    laneDecision,
    classification,
    clientBinding,
    actionPlan,
  );

  if (guardrailVerdict.modeDowngraded && guardrailVerdict.downgradedTo) {
    actionPlan.outputMode = guardrailVerdict.downgradedTo;
    actionPlan.needsAdvisorInput = true;
    actionPlan.safetyFlags.push(...guardrailVerdict.violations);
    // Clear draft reply on downgrade
    actionPlan.draftReplyText = null;
  }

  if (guardrailVerdict.strippedActions.length > 0) {
    const strippedIds = new Set(guardrailVerdict.strippedActions.map((a) => a.intentType));
    actionPlan.recommendedActions = actionPlan.recommendedActions.filter(
      (a) => !strippedIds.has(a.intentType),
    );
  }

  // 13. Execution plan
  // Use signal-upgraded case binding in execution plan
  const executionPlan =
    actionPlan.recommendedActions.length > 0
      ? mapToExecutionPlan(intakeId, actionPlan, clientBinding.clientId, finalCaseBinding.caseId)
      : null;

  const previewSteps = executionPlan ? mapToPreviewItems(executionPlan) : [];

  // 14. Preview payload
  const previewPayload = buildImageIntakePreview(
    intakeId, classification, clientBinding, finalCaseBinding, factBundle, actionPlan,
  );

  // 15. Trace
  const trace: ImageIntakeTrace = {
    intakeId, sessionId: request.sessionId,
    assetIds: request.assets.map((a) => a.assetId),
    laneDecision: laneDecision.lane,
    inputType: classification.inputType,
    outputMode: actionPlan.outputMode,
    clientBindingState: clientBinding.state,
    factCount: factBundle.facts.length,
    actionCount: actionPlan.recommendedActions.length,
    writeReady: previewPayload.writeReady,
    guardrailsTriggered: guardrailVerdict.violations,
    durationMs: Date.now() - startTime,
    timestamp: new Date(),
  };

  const response: ImageIntakeResponse = {
    intakeId, laneDecision, preflight: primaryPreflight,
    classification, clientBinding, caseBinding: finalCaseBinding,
    factBundle, actionPlan, previewSteps, trace,
  };

  return {
    response, executionPlan, previewPayload,
    classifierUsedModel, multimodalUsed, multimodalResult,
    stitchingResult, reviewHandoff, caseBindingV2: finalCaseBindingV2,
    threadReconstruction, handoffPayload, caseSignals, batchDecision,
    combinedMultimodalResult,
    crossSessionReconstruction,
    intentChange,
  };
}
