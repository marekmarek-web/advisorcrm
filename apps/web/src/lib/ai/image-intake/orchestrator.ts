/**
 * AI Photo / Image Intake — orchestration adapter (Phase 2).
 *
 * Connects the image intake lane to the existing assistant orchestration.
 * Phase 2 additions:
 * - real classifier (cheap-first two-layer)
 * - enhanced client/case binding v1 (session → UI context → none)
 * - action planning v1 via planner.ts
 *
 * Reuses canonical action surface, preview/confirm flow and write actions.
 * No new write engine.
 */

import { randomUUID } from "crypto";
import type { StepPreviewItem } from "../assistant-execution-ui";
import type { ExecutionPlan, ExecutionStep, CanonicalIntentType } from "../assistant-domain-model";
import type { AssistantSession } from "../assistant-session";
import type { ActiveContext } from "../assistant-session";

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
} from "./types";
import { emptyFactBundle, emptyActionPlan } from "./types";
import { runBatchPreflight } from "./preflight";
import { enforceImageIntakeGuardrails, safeOutputModeForUncertainInput } from "./guardrails";
import { classifyBatch } from "./classifier";
import { buildActionPlanV1 } from "./planner";

// ---------------------------------------------------------------------------
// Lane decision (deterministic — image lane is always the right lane for image input)
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
// Client / case binding v1 — priority chain
// ---------------------------------------------------------------------------

/**
 * Priority: session lock → session active → request UI context → unresolved.
 * Confidence reflects source quality.
 */
export function resolveClientBindingV1(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
): ClientBindingResult {
  // 1. Session locked client (highest priority)
  if (session?.lockedClientId) {
    return {
      state: "bound_client_confident",
      clientId: session.lockedClientId,
      clientLabel: null,
      confidence: 0.95,
      candidates: [],
      source: "session_context",
      warnings: [],
    };
  }

  // 2. Session active client
  if (session?.activeClientId) {
    return {
      state: "bound_client_confident",
      clientId: session.activeClientId,
      clientLabel: null,
      confidence: 0.80,
      candidates: [],
      source: "session_context",
      warnings: [],
    };
  }

  // 3. UI context from request
  if (request.activeClientId) {
    return {
      state: "bound_client_confident",
      clientId: request.activeClientId,
      clientLabel: null,
      confidence: 0.70,
      candidates: [],
      source: "ui_context",
      warnings: [],
    };
  }

  // 4. Nothing — unresolved
  return {
    state: "insufficient_binding",
    clientId: null,
    clientLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
    warnings: ["Klient nebyl identifikován — write-ready plán nelze vytvořit bez aktivního klientského kontextu."],
  };
}

export function resolveCaseBindingV1(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
): CaseBindingResult {
  const caseId =
    session?.lockedOpportunityId ??
    request.activeOpportunityId ??
    null;

  if (caseId) {
    return {
      state: "bound_case_confident",
      caseId,
      caseLabel: null,
      confidence: 0.80,
      candidates: [],
      source: session?.lockedOpportunityId ? "session_context" : "ui_context",
    };
  }

  return {
    state: "insufficient_binding",
    caseId: null,
    caseLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
  };
}

// ---------------------------------------------------------------------------
// Map image intake actions → canonical ExecutionPlan (reuse existing surface)
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

// ---------------------------------------------------------------------------
// Map to StepPreviewItem[] (reuse existing preview/confirm UI)
// ---------------------------------------------------------------------------

export function mapToPreviewItems(plan: ExecutionPlan): StepPreviewItem[] {
  return plan.steps.map((step) => ({
    stepId: step.stepId,
    label: step.label,
    action: step.label,
    description: step.params._imageIntakeSource
      ? `Image intake: ${step.action}`
      : String(step.action),
    preflightStatus: "ready" as const,
  }));
}

// ---------------------------------------------------------------------------
// Build preview payload for image intake
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
    factsSummary: factBundle.facts.map((f) => `${f.factType}: ${f.value ?? "–"}`),
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
    warnings: [
      ...clientBinding.warnings,
      ...actionPlan.safetyFlags,
    ],
  };
}

// ---------------------------------------------------------------------------
// Main orchestration entrypoint (Phase 2 — real classifier + planner)
// ---------------------------------------------------------------------------

export type ImageIntakeOrchestratorResult = {
  response: ImageIntakeResponse;
  executionPlan: ExecutionPlan | null;
  previewPayload: ImageIntakePreviewPayload;
  /** Whether classifier made a model call (for cost tracing). */
  classifierUsedModel: boolean;
};

export async function processImageIntake(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  activeContext?: ActiveContext | null,
): Promise<ImageIntakeOrchestratorResult> {
  const startTime = Date.now();
  const intakeId = `img_${randomUUID().slice(0, 12)}`;

  // Apply activeContext to supplement request binding info
  const effectiveRequest: ImageIntakeRequest = {
    ...request,
    activeClientId:
      request.activeClientId ??
      (typeof activeContext?.clientId === "string" ? activeContext.clientId : null),
    activeOpportunityId:
      request.activeOpportunityId ??
      (typeof activeContext?.opportunityId === "string" ? activeContext.opportunityId : null),
  };

  // 1. Batch preflight (deterministic, free)
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

  // 3. Client / case binding v1
  const clientBinding = resolveClientBindingV1(effectiveRequest, session);
  const caseBinding = resolveCaseBindingV1(effectiveRequest, session);

  // 4. Classification — cheap-first two-layer
  let classification: InputClassificationResult | null = null;
  let classifierUsedModel = false;

  if (batchPreflight.eligible) {
    const classifierResult = await classifyBatch(
      batchPreflight.assetResults
        .filter((r) => r.result.eligible && !r.result.isDuplicate)
        .map((r) => {
          const asset = request.assets.find((a) => a.assetId === r.assetId);
          return asset!;
        })
        .filter(Boolean),
      request.accompanyingText,
    );
    classification = classifierResult.result;
    classifierUsedModel = classifierResult.usedModel;

    // Early exit for obvious unusable — no further processing needed
    if (classifierResult.earlyExit) {
      const earlyPlan = emptyActionPlan("no_action_archive_only");
      const earlyPreview = buildImageIntakePreview(intakeId, classification, clientBinding, caseBinding, emptyFactBundle(), earlyPlan);
      const trace: ImageIntakeTrace = {
        intakeId,
        sessionId: request.sessionId,
        assetIds: request.assets.map((a) => a.assetId),
        laneDecision: laneDecision.lane,
        inputType: classification.inputType,
        outputMode: "no_action_archive_only",
        clientBindingState: clientBinding.state,
        factCount: 0,
        actionCount: 0,
        writeReady: false,
        guardrailsTriggered: [],
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      };
      return {
        response: { intakeId, laneDecision, preflight: primaryPreflight, classification, clientBinding, caseBinding, factBundle: emptyFactBundle(), actionPlan: earlyPlan, previewSteps: [], trace },
        executionPlan: null,
        previewPayload: earlyPreview,
        classifierUsedModel,
      };
    }
  }

  // 5. Fact extraction (stub — Phase 3)
  const factBundle = emptyFactBundle();

  // 6. Action planning v1
  const actionPlan = classification
    ? buildActionPlanV1(classification, clientBinding)
    : emptyActionPlan("no_action_archive_only");

  // 7. Guardrails
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
  }

  if (guardrailVerdict.strippedActions.length > 0) {
    const strippedIds = new Set(guardrailVerdict.strippedActions.map((a) => a.intentType));
    actionPlan.recommendedActions = actionPlan.recommendedActions.filter(
      (a) => !strippedIds.has(a.intentType),
    );
  }

  // 8. Execution plan (if actions exist)
  const executionPlan =
    actionPlan.recommendedActions.length > 0
      ? mapToExecutionPlan(intakeId, actionPlan, clientBinding.clientId, caseBinding.caseId)
      : null;

  const previewSteps = executionPlan ? mapToPreviewItems(executionPlan) : [];

  // 9. Preview payload
  const previewPayload = buildImageIntakePreview(
    intakeId,
    classification,
    clientBinding,
    caseBinding,
    factBundle,
    actionPlan,
  );

  // 10. Trace
  const trace: ImageIntakeTrace = {
    intakeId,
    sessionId: request.sessionId,
    assetIds: request.assets.map((a) => a.assetId),
    laneDecision: laneDecision.lane,
    inputType: classification?.inputType ?? null,
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
    intakeId,
    laneDecision,
    preflight: primaryPreflight,
    classification,
    clientBinding,
    caseBinding,
    factBundle,
    actionPlan,
    previewSteps,
    trace,
  };

  return { response, executionPlan, previewPayload, classifierUsedModel };
}
