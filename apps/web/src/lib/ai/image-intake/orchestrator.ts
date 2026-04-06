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
} from "./types";
import { emptyFactBundle, emptyActionPlan } from "./types";
import { runBatchPreflight } from "./preflight";
import { enforceImageIntakeGuardrails } from "./guardrails";
import { classifyBatch } from "./classifier";
import { buildActionPlanV2 } from "./planner";
import {
  shouldRunMultimodalPass,
  runCombinedMultimodalPass,
} from "./multimodal";
import {
  extractFactsFromMultimodalPass,
  buildSupportingReferenceFacts,
  buildUnusableFacts,
} from "./extractor";
import { resolveClientBindingV2, resolveCaseBindingV2 } from "./binding-v2";
import { tryBuildDraftReply } from "./draft-reply";
import {
  isImageIntakeMultimodalEnabled,
} from "./feature-flag";

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

  // 3. Classifier v1 (cheap-first: deterministic + optional text)
  let classification: InputClassificationResult | null = null;
  let classifierUsedModel = false;
  let earlyExit = false;

  if (batchPreflight.eligible) {
    const eligibleAssets = batchPreflight.assetResults
      .filter((r) => r.result.eligible && !r.result.isDuplicate)
      .map((r) => request.assets.find((a) => a.assetId === r.assetId)!)
      .filter(Boolean);

    if (eligibleAssets.length > 0) {
      const classifierDecision = await classifyBatch(eligibleAssets, request.accompanyingText);
      classification = classifierDecision.result;
      classifierUsedModel = classifierDecision.usedModel;
      earlyExit = classifierDecision.earlyExit;
    }
  }

  // 4. Early exits for unusable / no eligible assets
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
    };
  }

  // 5. Multimodal combined pass (escalation — Phase 3)
  // One call: classification upgrade + fact extraction + client name signal
  const primaryAsset = request.assets.find(
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

  // 6. CRM-aware binding v2 (uses name signal from multimodal if available)
  const nameSignal = multimodalResult?.possibleClientNameSignal ?? null;
  const clientBinding = await resolveClientBindingV2(effectiveRequest, session, nameSignal);
  const caseBinding = resolveCaseBindingV2(effectiveRequest, session);

  // 7. Draft reply (preview-only, communication screenshots + confident binding only)
  const draftReplyText = tryBuildDraftReply(
    classification.inputType,
    clientBinding,
    factBundle,
    multimodalResult?.draftReplyIntent ?? null,
  );

  // 8. Action planning v2 (uses extracted facts)
  const actionPlan = buildActionPlanV2(classification, clientBinding, factBundle, draftReplyText);

  // 9. Guardrails (unchanged from Phase 1)
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

  // 10. Execution plan
  const executionPlan =
    actionPlan.recommendedActions.length > 0
      ? mapToExecutionPlan(intakeId, actionPlan, clientBinding.clientId, caseBinding.caseId)
      : null;

  const previewSteps = executionPlan ? mapToPreviewItems(executionPlan) : [];

  // 11. Preview payload
  const previewPayload = buildImageIntakePreview(
    intakeId, classification, clientBinding, caseBinding, factBundle, actionPlan,
  );

  // 12. Trace
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
    classification, clientBinding, caseBinding,
    factBundle, actionPlan, previewSteps, trace,
  };

  return { response, executionPlan, previewPayload, classifierUsedModel, multimodalUsed, multimodalResult };
}
