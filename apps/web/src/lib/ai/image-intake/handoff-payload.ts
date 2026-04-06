/**
 * AI Photo / Image Intake — structured AI Review handoff payload contract (Phase 5).
 *
 * Builds a well-typed, auditable payload that can be passed to the AI Review
 * entrypoint. Image intake lane stays in its own lane — this payload is an
 * output, not a trigger. AI Review must be initiated explicitly (advisor confirms).
 *
 * Safety rules:
 * - No auto-execution — payload is advisory / preview-only
 * - No AI Review work performed inside image intake
 * - Lane separation: image intake orientation summary ≠ AI Review analysis
 * - Payload includes explicit lane note marker
 * - Only built when reviewHandoff.recommended === true
 *
 * Cost:
 * - Zero additional model calls — pure transformation of existing results
 */

import { randomUUID } from "crypto";
import type {
  ReviewHandoffRecommendation,
  ReviewHandoffPayload,
  HandoffPayloadStatus,
  ClientBindingResult,
  CaseBindingResultV2,
  ExtractedFactBundle,
  InputClassificationResult,
  NormalizedImageAsset,
  ImageIntakeRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Status determination
// ---------------------------------------------------------------------------

function determineHandoffStatus(
  recommendation: ReviewHandoffRecommendation,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
): HandoffPayloadStatus {
  if (!recommendation.recommended) return "insufficient";

  // Ready: good confidence, we have some orientation info
  if (
    recommendation.confidence >= 0.70 &&
    (factBundle.facts.length > 0 || recommendation.orientationSummary)
  ) {
    return "ready";
  }

  // Partial: signals present but low confidence or sparse facts
  if (recommendation.signals.length > 0) return "partial";

  return "insufficient";
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Builds a structured handoff payload for the AI Review entrypoint.
 *
 * Returns null when:
 * - Handoff is not recommended
 * - Status would be insufficient
 */
export function buildReviewHandoffPayload(
  recommendation: ReviewHandoffRecommendation,
  classification: InputClassificationResult | null,
  binding: ClientBindingResult,
  caseBindingV2: CaseBindingResultV2 | null,
  factBundle: ExtractedFactBundle,
  assets: NormalizedImageAsset[],
  request: ImageIntakeRequest,
): ReviewHandoffPayload | null {
  if (!recommendation.recommended) return null;

  const status = determineHandoffStatus(recommendation, binding, factBundle);
  if (status === "insufficient") return null;

  const ambiguityNotes: string[] = [];

  // Collect binding ambiguities
  if (binding.state === "insufficient_binding" || binding.state === "weak_candidate") {
    ambiguityNotes.push("Klient nebyl jistě identifikován — AI Review by měl potvrdit kontext.");
  }
  if (caseBindingV2 && (caseBindingV2.state === "multiple_case_candidates" || caseBindingV2.state === "unresolved_case")) {
    ambiguityNotes.push("Case/příležitost nebyla identifikována — AI Review by měl přiřadit ke správné příležitosti.");
  }

  // Add any fact ambiguities
  if (factBundle.ambiguityReasons.length > 0) {
    ambiguityNotes.push(...factBundle.ambiguityReasons.slice(0, 2));
  }

  const handoffReasons = [
    ...recommendation.signals.map((s) => `signal:${s}`),
    `confidence:${recommendation.confidence.toFixed(2)}`,
  ];

  return {
    handoffId: randomUUID(),
    status,
    sourceAssetIds: assets.map((a) => a.assetId),
    handoffReasons,
    orientationSummary: recommendation.orientationSummary,
    detectedInputType: classification?.inputType ?? null,
    bindingContext: {
      clientId: binding.clientId,
      clientLabel: binding.clientLabel,
      caseId: caseBindingV2?.caseId ?? null,
      caseLabel: caseBindingV2?.caseLabel ?? null,
      bindingConfidence: Math.min(binding.confidence, caseBindingV2?.confidence ?? 1.0),
    },
    ambiguityNotes,
    metadata: {
      sessionId: request.sessionId,
      tenantId: request.tenantId,
      userId: request.userId,
      uploadedAt: assets[0]?.uploadedAt ?? new Date(),
    },
    laneNote: "image_intake_lane_only_extracted_orientation",
  };
}

/**
 * Builds a human-readable handoff notice for the advisor preview message.
 */
export function buildHandoffPreviewNote(payload: ReviewHandoffPayload): string {
  const statusLabel = payload.status === "ready" ? "připraven" : "částečně připraven";
  const lines: string[] = [
    `AI Review handoff payload je ${statusLabel}.`,
    payload.orientationSummary
      ? `Orientační přehled: ${payload.orientationSummary.slice(0, 150)}`
      : "Orientační přehled není dostupný.",
  ];

  if (payload.ambiguityNotes.length > 0) {
    lines.push(`Nejistoty: ${payload.ambiguityNotes[0]}`);
  }

  lines.push("Dokument bude zpracován v AI Review lane — image intake extrahovala jen orientaci.");

  return lines.join(" ");
}
