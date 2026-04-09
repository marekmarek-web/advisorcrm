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
import type { ExecutionPlan } from "../assistant-domain-model";
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
import { buildActionPlanV4, buildIdentityContactIntakeActionPlan } from "./planner";
import {
  detectIdentityContactIntakeSignals,
  mapFactBundleToCreateContactDraft,
} from "./identity-contact-intake";
import { identityDocumentLikelyMatchesActiveContact } from "./identity-active-context-mismatch";
import { loadContactDisplayLabelForIntake } from "./load-contact-display-label-for-intake";
import { materializeIntakeImagesAsDocuments } from "./materialize-intake-documents";
import {
  shouldRunMultimodalPass,
  runCombinedMultimodalPass,
} from "./multimodal";
import {
  extractFactsFromMultimodalPass,
  buildSupportingReferenceFacts,
  buildUnusableFacts,
} from "./extractor";
import { resolveClientBindingV2, resolveCaseBindingV2, toCaseBindingResult, parseExplicitClientNameFromText } from "./binding-v2";
import { tryBuildDraftReply } from "./draft-reply";
import { parseExplicitIntent, textSignalsCrmExtractionIntent } from "./explicit-intent-parser";
import type { ParsedExplicitIntent } from "./explicit-intent-parser";
import {
  isImageIntakeMultimodalEnabledForUser,
  isImageIntakeStitchingEnabled,
  isImageIntakeReviewHandoffEnabledForUser,
  isImageIntakeThreadReconstructionEnabledForUser,
  isImageIntakeCaseSignalEnabledForUser,
  isImageIntakeCombinedMultimodalEnabledForUser,
  isImageIntakeCrossSessionEnabledForUser,
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
import { reconstructCrossSessionThread, persistThreadArtifact, mergePersistedArtifacts } from "./cross-session-reconstruction";
import { detectIntentChange } from "./intent-change-detection";
import { runIntentChangeAssist } from "./intent-change-assist";
import { getImageIntakeConfig } from "./image-intake-config";
import { buildDocumentSetPreviewNote } from "./document-set-intake";
import { buildHandoffLifecycleNote } from "./handoff-lifecycle";
import { mapToExecutionPlan, mapToPreviewItems } from "./intake-execution-plan-mapper";
import type {
  ThreadReconstructionResult,
  ReviewHandoffPayload,
  CaseSignalBundle,
  BatchMultimodalDecision,
  CrossSessionReconstructionResult,
  IntentChangeFinding,
  HouseholdBindingResult,
  DocumentMultiImageResult,
  HandoffLifecycleFeedback,
  IntentAssistCacheStatus,
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

export { mapToExecutionPlan, mapToPreviewItems };

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
  phase9?: {
    householdBinding?: HouseholdBindingResult | null;
    documentSetResult?: DocumentMultiImageResult | null;
    lifecycleFeedback?: HandoffLifecycleFeedback | null;
    intentAssistCacheStatus?: IntentAssistCacheStatus | null;
  },
): ImageIntakePreviewPayload {
  const writeReady =
    actionPlan.recommendedActions.length > 0 &&
    !actionPlan.needsAdvisorInput &&
    (clientBinding.state === "bound_client_confident" || clientBinding.state === "bound_case_confident");

  // Phase 9: household ambiguity note
  const householdAmbiguityNote = phase9?.householdBinding?.ambiguityNote ?? null;

  // Phase 9: document set note (from evaluator)
  const documentSetNote: string | null = phase9?.documentSetResult
    ? buildDocumentSetPreviewNote(phase9.documentSetResult)
    : null;

  // Phase 9: lifecycle note
  const lifecycleStatusNote: string | null =
    phase9?.lifecycleFeedback && phase9.lifecycleFeedback.status !== "unknown"
      ? buildHandoffLifecycleNote(phase9.lifecycleFeedback)
      : null;

  const warnings = [...clientBinding.warnings, ...actionPlan.safetyFlags];
  // Phase 9: surface household ambiguity as a warning
  if (householdAmbiguityNote) {
    warnings.push(householdAmbiguityNote);
  }

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
    warnings,
    householdAmbiguityNote,
    documentSetNote,
    lifecycleStatusNote,
    intentAssistCacheStatus: phase9?.intentAssistCacheStatus ?? null,
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
  /** Phase 9: household / multi-client binding result (null when not evaluated). */
  householdBinding: import("./types").HouseholdBindingResult | null;
  /** Phase 9: document multi-image set evaluator result (null when not applicable). */
  documentSetResult: import("./types").DocumentMultiImageResult | null;
  /**
   * Phase 9: AI Review handoff lifecycle feedback (null when no reviewRowId known).
   *
   * NOTE: This field is always null as returned by processImageIntake().
   * The route-handler injects lifecycle feedback AFTER the orchestrator run,
   * once the session reviewRowId is available from a prior submit.
   * See: confirm-flow-lifecycle.ts → getLifecycleFeedbackForSession()
   */
  lifecycleFeedback: import("./types").HandoffLifecycleFeedback | null;
  /** Phase 9: intent-assist cache status from last assist call. */
  intentAssistCacheStatus: import("./types").IntentAssistCacheStatus | null;
  /** Parsed intent from accompanying text (null when no text provided). */
  parsedIntent: ParsedExplicitIntent | null;
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
  const threadReconstructionEnabled = isImageIntakeThreadReconstructionEnabledForUser(
    request.userId,
    request.tenantId,
  );
  const caseSignalEnabled = isImageIntakeCaseSignalEnabledForUser(request.userId, request.tenantId);
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
      householdBinding: null, documentSetResult: null, lifecycleFeedback: null, intentAssistCacheStatus: null,
      parsedIntent: parseExplicitIntent(request.accompanyingText) ?? null,
    };
  }

  // 6. Multimodal — multi-page dokument (grouped_related + photo_or_scan) nebo single primary
  const primaryAsset = primaryAssets.find(
    (a) => batchPreflight.assetResults.find((r) => r.assetId === a.assetId && r.result.eligible),
  );
  const multimodalEnabled = isImageIntakeMultimodalEnabledForUser(request.userId, request.tenantId);
  const combinedMultimodalEnabled = isImageIntakeCombinedMultimodalEnabledForUser(
    effectiveRequest.userId ?? "",
    effectiveRequest.tenantId,
  );

  let multimodalResult: MultimodalCombinedPassResult | null = null;
  let multimodalUsed = false;
  let factBundle: ExtractedFactBundle = emptyFactBundle();
  let batchDecision: BatchMultimodalDecision | null = null;
  let combinedMultimodalResult: import("./combined-multimodal-execution").CombinedMultimodalExecutionResult | null = null;
  let documentSetResult: DocumentMultiImageResult | null = null;
  let docGroupPerAssetBundles: Map<string, ExtractedFactBundle> | null = null;

  const relatedDocGroup =
    stitchingResult?.groups.find(
      (g) =>
        g.decision === "grouped_related" &&
        g.assetIds.length >= 2 &&
        g.assetIds.every((id) => {
          const c = stitchingClassMap.get(id);
          return c?.inputType === "photo_or_scan_document";
        }),
    ) ?? null;

  if (relatedDocGroup && multimodalEnabled) {
    batchDecision = decideBatchMultimodalStrategy(
      relatedDocGroup,
      request.assets,
      stitchingClassMap,
      new Map(),
      multimodalEnabled,
    );
    const bundleMap = new Map<string, ExtractedFactBundle>();
    const primaryIds = relatedDocGroup.assetIds.filter((id) => !relatedDocGroup.duplicateAssetIds.includes(id));
    let docGroupVisionDone = false;

    if (batchDecision.strategy === "combined_pass" && combinedMultimodalEnabled) {
      combinedMultimodalResult = await executeBatchMultimodalStrategy(
        batchDecision,
        request.assets,
        request.accompanyingText ?? null,
        classification.inputType,
      );
      if (combinedMultimodalResult.strategy === "combined_pass" && combinedMultimodalResult.groupFactBundle) {
        const fb = combinedMultimodalResult.groupFactBundle;
        multimodalResult = combinedMultimodalResult.multimodalResult;
        for (const id of primaryIds) {
          bundleMap.set(id, fb);
        }
        docGroupVisionDone = true;
      }
    }

    if (!docGroupVisionDone && batchDecision.perAssetIds.length > 0) {
      for (const id of batchDecision.perAssetIds) {
        const asset =
          primaryAssets.find((a) => a.assetId === id) ?? request.assets.find((a) => a.assetId === id);
        if (!asset?.storageUrl) continue;
        const pass = await runCombinedMultimodalPass(
          asset.storageUrl,
          classification.inputType,
          request.accompanyingText,
        );
        if (pass.result) {
          bundleMap.set(id, extractFactsFromMultimodalPass(pass.result, id));
          multimodalResult = pass.result;
          docGroupVisionDone = true;
        }
      }
    }

    if (bundleMap.size >= 2) {
      docGroupPerAssetBundles = bundleMap;
      const { evaluateDocumentMultiImageSet } = await import("./document-set-intake");
      documentSetResult = evaluateDocumentMultiImageSet(relatedDocGroup, stitchingClassMap, bundleMap);
      if (documentSetResult.decision === "consolidated_document_facts" && documentSetResult.mergedFactBundle) {
        factBundle = documentSetResult.mergedFactBundle;
      } else {
        const { mergeFactBundlesForDocumentGroup } = await import("./document-set-intake");
        factBundle = mergeFactBundlesForDocumentGroup([...bundleMap.values()], relatedDocGroup.assetIds);
      }
      multimodalUsed = true;
      if (multimodalResult && multimodalResult.confidence > classification.confidence + 0.1) {
        classification = {
          ...classification,
          inputType: multimodalResult.inputType,
          confidence: multimodalResult.confidence,
          uncertaintyFlags: multimodalResult.ambiguityReasons.length > 0 ? ["multimodal_uncertain"] : [],
        };
      }
    }
  }

  const skipPrimaryMultimodal = docGroupPerAssetBundles !== null && factBundle.facts.length > 0;

  if (
    !skipPrimaryMultimodal &&
    shouldRunMultimodalPass(
      classification.inputType,
      classification.confidence,
      earlyExit,
      primaryAsset?.storageUrl ?? null,
      multimodalEnabled,
    )
  ) {
    const passDecision = await runCombinedMultimodalPass(
      primaryAsset!.storageUrl!,
      classification.inputType,
      request.accompanyingText,
    );
    multimodalResult = passDecision.result;
    multimodalUsed = true;

    if (multimodalResult.confidence > classification.confidence + 0.1) {
      classification = {
        ...classification,
        inputType: multimodalResult.inputType,
        confidence: multimodalResult.confidence,
        uncertaintyFlags: multimodalResult.ambiguityReasons.length > 0 ? ["multimodal_uncertain"] : [],
      };
    }

    factBundle = extractFactsFromMultimodalPass(multimodalResult, primaryAsset?.assetId ?? intakeId);
  } else if (classification.inputType === "supporting_reference_image") {
    factBundle = buildSupportingReferenceFacts(primaryAsset?.assetId ?? intakeId);
  }

  // 6b. Parse explicit intent from accompanying text (structured, reusable)
  const parsedIntent = parseExplicitIntent(request.accompanyingText);

  // 6c. Intent-aware classification boost: when user explicitly asks for CRM extraction
  // and classifier was uncertain, upgrade to structured_image_fact_intake confidence
  if (
    classification &&
    textSignalsCrmExtractionIntent(parsedIntent) &&
    classification.confidence < 0.70 &&
    classification.inputType !== "general_unusable_image"
  ) {
    classification = {
      ...classification,
      confidence: Math.max(classification.confidence, 0.72),
      uncertaintyFlags: classification.uncertaintyFlags.filter((f) => f !== "low_confidence"),
    };
  }

  // 7. CRM-aware binding v2 (uses name signal from multimodal + explicit name from user text)
  const nameSignal = multimodalResult?.possibleClientNameSignal ?? null;
  const nameFromText = parsedIntent.clientName ?? parseExplicitClientNameFromText(request.accompanyingText);
  let clientBinding = await resolveClientBindingV2(effectiveRequest, session, nameSignal, nameFromText);

  // 8. Case/opportunity binding v2 (Phase 4 — DB lookup when client is known)
  let resolvedClientId = clientBinding.clientId;
  let caseBindingV2 = await resolveCaseBindingV2(effectiveRequest, session, resolvedClientId);
  const caseBinding = toCaseBindingResult(caseBindingV2);

  // 9. Review handoff recommendation (Phase 4 — no model call)
  const handoffFlagEnabled = isImageIntakeReviewHandoffEnabledForUser(
    effectiveRequest.userId,
    effectiveRequest.tenantId,
  );
  const reviewHandoff = evaluateReviewHandoff(classification, factBundle, handoffFlagEnabled);

  // Phase 5: Thread reconstruction (for grouped threads when flag enabled)
  let threadReconstruction: ThreadReconstructionResult | null = null;

  if (stitchingResult && threadReconstructionEnabled) {
    const groupedGroup = stitchingResult.groups.find(
      (g) => g.decision === "grouped_thread" || g.decision === "grouped_related",
    );
    if (groupedGroup && groupedGroup.assetIds.length >= 2) {
      const perAssetBundles = new Map<string, ExtractedFactBundle>();
      if (
        docGroupPerAssetBundles &&
        relatedDocGroup &&
        groupedGroup.groupId === relatedDocGroup.groupId
      ) {
        for (const [k, v] of docGroupPerAssetBundles) perAssetBundles.set(k, v);
      } else if (primaryAsset) {
        perAssetBundles.set(primaryAsset.assetId, factBundle);
      }
      threadReconstruction = reconstructThread(groupedGroup, request.assets, perAssetBundles);
    }

    const existingMultimodalResults = new Map<string, MultimodalCombinedPassResult | null>();
    if (primaryAsset && multimodalResult) {
      existingMultimodalResults.set(primaryAsset.assetId, multimodalResult);
    }
    const firstGroup = stitchingResult.groups[0];
    if (firstGroup && !batchDecision) {
      batchDecision = decideBatchMultimodalStrategy(
        firstGroup,
        request.assets,
        stitchingClassMap,
        existingMultimodalResults,
        multimodalEnabled,
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
  let finalCaseBinding = toCaseBindingResult(finalCaseBindingV2);

  if (
    batchDecision &&
    batchDecision.strategy === "combined_pass" &&
    combinedMultimodalEnabled &&
    combinedMultimodalResult == null
  ) {
    combinedMultimodalResult = await executeBatchMultimodalStrategy(
      batchDecision,
      request.assets,
      request.accompanyingText ?? null,
      classification.inputType,
    );
    if (combinedMultimodalResult.strategy === "combined_pass" && combinedMultimodalResult.groupFactBundle) {
      factBundle = combinedMultimodalResult.groupFactBundle;
    }
  }

  // Phase 6: Cross-session thread reconstruction (when enabled + client known)
  let crossSessionReconstruction: CrossSessionReconstructionResult | null = null;
  const crossSessionEnabled = isImageIntakeCrossSessionEnabledForUser(
    effectiveRequest.userId ?? "",
    effectiveRequest.tenantId,
  );
  if (crossSessionEnabled && threadReconstruction) {
    // Phase 7: Load persisted artifacts from DB (non-blocking, degrades gracefully)
    const ph7Config = getImageIntakeConfig();
    if (ph7Config.crossSessionPersistenceEnabled && clientBinding.clientId) {
      try {
        const { loadArtifactsFromDb } = await import("./cross-session-persistence");
        const dbArtifacts = await loadArtifactsFromDb(effectiveRequest.tenantId, clientBinding.clientId);
        if (dbArtifacts.length > 0) {
          mergePersistedArtifacts(effectiveRequest.tenantId, clientBinding.clientId, dbArtifacts);
        }
      } catch {
        // Safe degradation — in-process store only
      }
    }

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
      // Phase 7: Also persist to DB asynchronously (non-blocking)
      if (ph7Config.crossSessionPersistenceEnabled) {
        const currentArtifacts = threadReconstruction.mergedFacts.length > 0 ? [{
          artifactId: `${effectiveRequest.tenantId}:${clientBinding.clientId}:${Date.now()}`,
          tenantId: effectiveRequest.tenantId,
          userId: effectiveRequest.userId ?? "",
          clientId: clientBinding.clientId,
          lastUpdatedAt: new Date().toISOString(),
          priorMergedFacts: threadReconstruction.mergedFacts,
          priorLatestSignal: threadReconstruction.latestActionableSignal,
          sourceSessionIds: [intakeId],
        }] : [];
        if (currentArtifacts.length > 0) {
          import("./cross-session-persistence").then(({ persistArtifactsToDb }) => {
            persistArtifactsToDb(
              effectiveRequest.tenantId,
              effectiveRequest.userId ?? "",
              clientBinding.clientId!,
              currentArtifacts,
            ).catch(() => {}); // non-blocking, fire-and-forget
          }).catch(() => {});
        }
      }
    }
  }

  // Phase 6: Intent change detection (when thread reconstruction has multiple assets)
  let intentChange: IntentChangeFinding | null = null;
  if (threadReconstruction && request.assets.length >= 2) {
    intentChange = detectIntentChange(
      threadReconstruction.mergedFacts,
      request.assets.length >= 2,
    );

    // Phase 7: Optional model assist for ambiguous intent (max 1 extra call)
    // Phase 9: passes userId for persistent cache
    if (intentChange?.status === "ambiguous") {
      const assisted = await runIntentChangeAssist(
        intentChange,
        threadReconstruction.mergedFacts,
        effectiveRequest.tenantId,
        effectiveRequest.userId,
      );
      if (assisted) intentChange = assisted;
    }
  }

  // Phase 9: Household / multi-client binding scope
  let householdBinding: HouseholdBindingResult | null = null;
  if (clientBinding.clientId && effectiveRequest.tenantId) {
    try {
      const { resolveHouseholdBinding } = await import("./binding-household");
      householdBinding = await resolveHouseholdBinding(
        effectiveRequest.tenantId,
        clientBinding.clientId,
        effectiveRequest.activeClientId,
      );
    } catch {
      // Non-blocking — safe degradation
    }
  }

  // Phase 9: Track intent-assist cache status (from last assist call context)
  let intentAssistCacheStatus: IntentAssistCacheStatus | null = null;
  if (intentChange && threadReconstruction) {
    const { lookupIntentAssistCache } = await import("./intent-assist-cache");
    const lookup = lookupIntentAssistCache(
      { ...intentChange, status: "ambiguous" },
      threadReconstruction.mergedFacts,
    );
    intentAssistCacheStatus = lookup.cacheStatus;
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

  // 11. Action planning v4 (Phase 10 — adds document-set outcome awareness)
  let actionPlan = buildActionPlanV4(
    classification,
    clientBinding,
    factBundle,
    draftReplyText,
    reviewHandoff,
    documentSetResult,
    parsedIntent,
  );

  const identityIntakeEligible = detectIdentityContactIntakeSignals(
    classification,
    factBundle,
    documentSetResult,
    parsedIntent,
  );
  if (identityIntakeEligible) {
    const materializedDocumentIds = await materializeIntakeImagesAsDocuments(
      request.assets,
      request.tenantId,
      request.userId,
      intakeId,
    );
    actionPlan = buildIdentityContactIntakeActionPlan(factBundle, materializedDocumentIds);
  }

  const bindingFromRouteOrSession =
    clientBinding.source === "session_context" || clientBinding.source === "ui_context";
  if (identityIntakeEligible && clientBinding.clientId && bindingFromRouteOrSession) {
    const draft = mapFactBundleToCreateContactDraft(factBundle);
    const activeLabel = await loadContactDisplayLabelForIntake(
      effectiveRequest.tenantId,
      clientBinding.clientId,
    );
    const cmp = identityDocumentLikelyMatchesActiveContact({
      extractedFirstName: draft.params.firstName,
      extractedLastName: draft.params.lastName,
      activeContactDisplayLabel: activeLabel,
    });
    if (cmp.verdict === "mismatch") {
      const suppressedId = clientBinding.clientId;
      clientBinding = {
        state: "insufficient_binding",
        clientId: null,
        clientLabel: activeLabel,
        confidence: 0.25,
        candidates: [],
        source: "identity_context_mismatch",
        warnings: [
          `Údaje na dokladu nesedí s otevřeným kontaktem v CRM${activeLabel ? ` (${activeLabel})` : ""}.`,
        ],
        suppressedActiveClientId: suppressedId,
        suppressedActiveClientLabel: activeLabel,
      };
      resolvedClientId = null;
      const recomputedCase = await resolveCaseBindingV2(effectiveRequest, session, null);
      caseBindingV2 = recomputedCase;
      finalCaseBindingV2 = recomputedCase;
      finalCaseBinding = toCaseBindingResult(recomputedCase);
    }
  }

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

  // 14. Preview payload (Phase 9: pass new context)
  const previewPayload = buildImageIntakePreview(
    intakeId, classification, clientBinding, finalCaseBinding, factBundle, actionPlan,
    {
      householdBinding,
      documentSetResult,
      lifecycleFeedback: null, // lifecycle is looked up on-demand after submit; not available during intake run
      intentAssistCacheStatus,
    },
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
    householdBinding,
    documentSetResult,
    lifecycleFeedback: null,
    intentAssistCacheStatus,
    parsedIntent: parsedIntent ?? null,
  };
}
