/**
 * AI Photo / Image Intake — route handler.
 *
 * Glue between the assistant chat route and the image intake pipeline.
 * Parses raw image assets from request body, builds ImageIntakeRequest,
 * runs the pipeline, stores the plan in session, and maps to AssistantResponse.
 *
 * The existing chat route calls handleImageIntakeFromChatRoute() when
 * imageAssets are present and IMAGE_INTAKE_ENABLED=true.
 */

import { randomUUID } from "crypto";
import type { AssistantSession } from "../assistant-session";
import { clearPendingImageIntakeResolution, lockAssistantClient } from "../assistant-session";
import type { ActiveContext } from "../assistant-session";
import type { AssistantResponse } from "../assistant-tool-router";
import { getAssistantRunStore } from "../assistant-run-context";
import { logAuditAction } from "@/lib/audit";
import type { ImageIntakeRouteOptions, NormalizedImageAsset } from "./types";
import { SUPPORTED_IMAGE_MIMES, MAX_IMAGE_SIZE_BYTES, MAX_IMAGES_PER_INTAKE } from "./types";
import { processImageIntake } from "./orchestrator";
import { mapImageIntakeToAssistantResponse } from "./response-mapper";
import { getImageIntakeFlagState } from "./feature-flag";
import { inferMimeTypeForIntakeAsset, normalizeIntakeImageAssetsForVision } from "./normalize-intake-image-input";
import type { ImageAssetInput } from "./image-asset-input";
import { buildPendingImageIntakeResolutionFromOrchestratorResult } from "./pending-resolution-metadata";

export type { ImageAssetInput } from "./image-asset-input";

// ---------------------------------------------------------------------------
// Parse and normalize imageAssets from request body
// ---------------------------------------------------------------------------

export function parseImageAssetsFromBodyResult(body: unknown): {
  assets: ImageAssetInput[];
  truncated: boolean;
} {
  if (!body || typeof body !== "object") return { assets: [], truncated: false };
  const raw = (body as Record<string, unknown>).imageAssets;
  if (!Array.isArray(raw)) return { assets: [], truncated: false };

  const filtered = raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      assetId: typeof item.assetId === "string" ? item.assetId : undefined,
      url: typeof item.url === "string" ? item.url : "",
      mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
      filename: typeof item.filename === "string" ? item.filename : null,
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
      contentHash: typeof item.contentHash === "string" ? item.contentHash : null,
    }))
    .filter((a) => a.url.length > 0);
  const truncated = filtered.length > MAX_IMAGES_PER_INTAKE;
  return {
    assets: filtered.slice(0, MAX_IMAGES_PER_INTAKE),
    truncated,
  };
}

export function parseImageAssetsFromBody(body: unknown): ImageAssetInput[] {
  return parseImageAssetsFromBodyResult(body).assets;
}

function normalizeAsset(input: ImageAssetInput): NormalizedImageAsset {
  return {
    assetId: input.assetId ?? `asset_${randomUUID().slice(0, 8)}`,
    originalFilename: input.filename ?? null,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes ?? 0,
    width: input.width ?? null,
    height: input.height ?? null,
    contentHash: input.contentHash ?? null,
    storageUrl: input.url,
    thumbnailUrl: null,
    uploadedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Validate image assets early (before pipeline, cheap check)
// ---------------------------------------------------------------------------

function validateAssetsBasic(assets: ImageAssetInput[]): { ok: boolean; reason: string | null } {
  if (assets.length === 0) return { ok: false, reason: "no_assets" };

  const hasSupported = assets.some(
    (a) =>
      SUPPORTED_IMAGE_MIMES.has(a.mimeType) &&
      ((a.sizeBytes ?? 0) === 0 || (a.sizeBytes ?? 0) <= MAX_IMAGE_SIZE_BYTES),
  );

  if (!hasSupported) {
    return { ok: false, reason: "no_supported_assets" };
  }

  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Safe fallback AssistantResponse for image intake failures
// ---------------------------------------------------------------------------

function imageIntakeFallbackResponse(sessionId: string, reason: string): AssistantResponse {
  return {
    message: "Obrázek se nepodařilo zpracovat. Zkuste to znovu nebo nahrajte jiný formát.",
    referencedEntities: [],
    suggestedActions: [],
    warnings: [`image_intake_error: ${reason}`],
    confidence: 0.0,
    sourcesSummary: ["image_intake_error"],
    sessionId,
    executionState: null,
    contextState: null,
  };
}

function imageIntakeAdvisorMessageResponse(
  sessionId: string,
  message: string,
  reason: string,
): AssistantResponse {
  return {
    message,
    referencedEntities: [],
    suggestedActions: [],
    warnings: [`image_intake_error: ${reason}`],
    confidence: 0.0,
    sourcesSummary: ["image_intake_error"],
    sessionId,
    executionState: null,
    contextState: null,
  };
}

// ---------------------------------------------------------------------------
// Main handler — called from chat route
// ---------------------------------------------------------------------------

export async function handleImageIntakeFromChatRoute(
  rawAssets: ImageAssetInput[],
  session: AssistantSession,
  activeContext: ActiveContext,
  opts: ImageIntakeRouteOptions,
): Promise<AssistantResponse> {
  const runStore = getAssistantRunStore();

  const flagState = getImageIntakeFlagState();

  // Should not be called when flag is off, but guard defensively
  if (flagState !== "enabled") {
    return imageIntakeFallbackResponse(
      session.sessionId,
      "image_intake_disabled",
    );
  }

  const assetsWithInferredMime = rawAssets.map(inferMimeTypeForIntakeAsset);

  // Basic validation (cheap, no model)
  const validation = validateAssetsBasic(assetsWithInferredMime);
  if (!validation.ok) {
    logAuditAction({
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: "image_intake.route_rejected",
      entityType: "assistant_run",
      entityId: runStore?.assistantRunId ?? "unknown",
      meta: { reason: validation.reason, flagState },
    });
    return imageIntakeFallbackResponse(session.sessionId, validation.reason ?? "invalid_assets");
  }

  const visionNorm = await normalizeIntakeImageAssetsForVision(assetsWithInferredMime);
  if (!visionNorm.ok) {
    logAuditAction({
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: "image_intake.heic_normalization_failed",
      entityType: "assistant_run",
      entityId: runStore?.assistantRunId ?? "unknown",
      meta: { reason: visionNorm.reasonCode, flagState },
    });
    return imageIntakeAdvisorMessageResponse(
      session.sessionId,
      visionNorm.advisorMessage,
      visionNorm.reasonCode,
    );
  }

  const normalizedAssets = visionNorm.assets.map(normalizeAsset);

  const request = {
    sessionId: session.sessionId,
    tenantId: opts.tenantId,
    userId: opts.userId,
    assets: normalizedAssets,
    activeClientId: typeof activeContext.clientId === "string" ? activeContext.clientId : null,
    activeOpportunityId: typeof activeContext.opportunityId === "string" ? activeContext.opportunityId : null,
    activeCaseId: null,
    accompanyingText: opts.accompanyingText,
    channel: opts.channel,
    resolvedContext: opts.resolvedContext ?? null,
  };

  // Clear stale execution plan from prior run — new image intake is a fresh request.
  // Prevents confirm/cancel flow from operating on a plan from a different run.
  session.lastExecutionPlan = undefined;
  clearPendingImageIntakeResolution(session);

  let result: Awaited<ReturnType<typeof processImageIntake>>;
  try {
    result = await processImageIntake(request, session, activeContext);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    logAuditAction({
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: "image_intake.pipeline_error",
      entityType: "assistant_run",
      entityId: runStore?.assistantRunId ?? "unknown",
      meta: { error: errMsg, flagState },
    });
    return imageIntakeFallbackResponse(session.sessionId, errMsg);
  }

  // Store plan in session for confirm/cancel flow (reuse existing mechanism)
  if (result.executionPlan) {
    session.lastExecutionPlan = result.executionPlan;

    // Lock client if binding resolved one
    const boundClientId = result.response.clientBinding.clientId;
    if (boundClientId && !session.lockedClientId) {
      lockAssistantClient(session, boundClientId);
    }
  }

  // Telemetry (structured reason codes — no sensitive content)
  logAuditAction({
    tenantId: opts.tenantId,
    userId: opts.userId,
    action: "image_intake.pipeline_done",
    entityType: "assistant_run",
    entityId: runStore?.assistantRunId ?? "unknown",
    meta: {
      intakeId: result.response.intakeId,
      outputMode: result.response.actionPlan.outputMode,
      inputType: result.response.classification?.inputType ?? null,
      clientBindingState: result.response.clientBinding.state,
      guardrailsTriggered: result.response.trace.guardrailsTriggered.length,
      classifierUsedModel: result.classifierUsedModel,
      writeReady: result.previewPayload.writeReady,
      flagState,
    },
  });

  const out = mapImageIntakeToAssistantResponse(result, session.sessionId);
  if (opts.assetsTruncated) {
    const w = "Nahráno více než 4 obrázky — zpracovány jsou jen první čtyři.";
    out.warnings = out.warnings.includes(w) ? out.warnings : [...out.warnings, w];
  }

  const pending = buildPendingImageIntakeResolutionFromOrchestratorResult(result);
  if (pending) {
    session.pendingImageIntakeResolution = pending;
  } else {
    clearPendingImageIntakeResolution(session);
  }

  return out;
}
