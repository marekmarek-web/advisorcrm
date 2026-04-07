/**
 * Persist / restore {@link PendingImageIntakeResolution} in assistant_conversations.metadata (jsonb).
 * Single source of TTL aligned with client-resolution continuation flow.
 */

import type { AssistantSession, PendingImageIntakeResolution } from "../assistant-session";
import type { EvidenceReference, ExtractedFactBundle, ExtractedImageFact, ImageIntakeActionPlan } from "./types";
import { FACT_TYPES, IMAGE_OUTPUT_MODES } from "./types";

export const PENDING_IMAGE_INTAKE_METADATA_KEY = "pendingImageIntakeResolution" as const;

/** Keep in sync with resume UX — same as client-resolution continuation window. */
export const PENDING_IMAGE_INTAKE_RESOLUTION_TTL_MS = 15 * 60 * 1000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function isPendingImageIntakeResolutionExpired(pending: PendingImageIntakeResolution): boolean {
  const t = new Date(pending.createdAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > PENDING_IMAGE_INTAKE_RESOLUTION_TTL_MS;
}

function parseEvidenceReference(x: unknown): EvidenceReference | null {
  if (!isRecord(x)) return null;
  if (typeof x.sourceAssetId !== "string") return null;
  if (x.evidenceText !== null && typeof x.evidenceText !== "string") return null;
  const sr = x.sourceRegion;
  if (sr !== null) {
    if (!isRecord(sr) || typeof sr.x !== "number" || typeof sr.y !== "number" || typeof sr.w !== "number" || typeof sr.h !== "number") {
      return null;
    }
  }
  if (typeof x.confidence !== "number") return null;
  return {
    sourceAssetId: x.sourceAssetId,
    evidenceText: (x.evidenceText as string | null) ?? null,
    sourceRegion:
      sr === null
        ? null
        : { x: (sr as Record<string, number>).x, y: (sr as Record<string, number>).y, w: (sr as Record<string, number>).w, h: (sr as Record<string, number>).h },
    confidence: x.confidence,
  };
}

function parseExtractedImageFact(x: unknown): ExtractedImageFact | null {
  if (!isRecord(x)) return null;
  if (typeof x.factType !== "string" || !FACT_TYPES.includes(x.factType as (typeof FACT_TYPES)[number])) return null;
  if (typeof x.factKey !== "string") return null;
  if (!("value" in x)) return null;
  const v = x.value;
  if (v !== null && typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return null;
  if (x.normalizedValue !== null && typeof x.normalizedValue !== "string") return null;
  if (typeof x.confidence !== "number") return null;
  let evidence: EvidenceReference | null = null;
  if (x.evidence !== null && x.evidence !== undefined) {
    evidence = parseEvidenceReference(x.evidence);
    if (!evidence) return null;
  } else if (x.evidence === undefined) {
    evidence = null;
  } else {
    evidence = null;
  }
  const observedVsInferred = x.observedVsInferred;
  if (observedVsInferred !== "observed" && observedVsInferred !== "inferred") return null;
  return {
    factType: x.factType as ExtractedImageFact["factType"],
    factKey: x.factKey,
    value: v as string | number | boolean | null,
    normalizedValue: (x.normalizedValue as string | null) ?? null,
    confidence: x.confidence,
    evidence,
    isActionable: typeof x.isActionable === "boolean" ? x.isActionable : true,
    needsConfirmation: typeof x.needsConfirmation === "boolean" ? x.needsConfirmation : false,
    observedVsInferred,
  };
}

function parseFactBundle(x: unknown): ExtractedFactBundle | null {
  if (!isRecord(x)) return null;
  if (!Array.isArray(x.facts)) return null;
  const facts: ExtractedImageFact[] = [];
  for (const f of x.facts) {
    const p = parseExtractedImageFact(f);
    if (!p) return null;
    facts.push(p);
  }
  if (!Array.isArray(x.missingFields) || !x.missingFields.every((m) => typeof m === "string")) return null;
  if (!Array.isArray(x.ambiguityReasons) || !x.ambiguityReasons.every((m) => typeof m === "string")) return null;
  const extractionSource = x.extractionSource;
  if (extractionSource !== "multimodal_pass" && extractionSource !== "stub") return null;
  return {
    facts,
    missingFields: x.missingFields,
    ambiguityReasons: x.ambiguityReasons,
    extractionSource,
  };
}

function parseActionPlan(x: unknown): ImageIntakeActionPlan | null {
  if (!isRecord(x)) return null;
  if (typeof x.outputMode !== "string" || !IMAGE_OUTPUT_MODES.includes(x.outputMode as (typeof IMAGE_OUTPUT_MODES)[number])) {
    return null;
  }
  if (!Array.isArray(x.recommendedActions)) return null;
  if (x.draftReplyText !== null && typeof x.draftReplyText !== "string") return null;
  if (typeof x.whyThisAction !== "string") return null;
  if (x.whyNotOtherActions !== null && typeof x.whyNotOtherActions !== "string") return null;
  if (typeof x.needsAdvisorInput !== "boolean") return null;
  if (!Array.isArray(x.safetyFlags) || !x.safetyFlags.every((s) => typeof s === "string")) return null;
  return {
    outputMode: x.outputMode as ImageIntakeActionPlan["outputMode"],
    recommendedActions: x.recommendedActions as ImageIntakeActionPlan["recommendedActions"],
    draftReplyText: x.draftReplyText,
    whyThisAction: x.whyThisAction,
    whyNotOtherActions: x.whyNotOtherActions,
    needsAdvisorInput: x.needsAdvisorInput,
    safetyFlags: x.safetyFlags,
  };
}

function parseCandidates(x: unknown): Array<{ id: string; label: string }> | null {
  if (!Array.isArray(x)) return null;
  const out: Array<{ id: string; label: string }> = [];
  for (const c of x) {
    if (!isRecord(c) || typeof c.id !== "string" || typeof c.label !== "string") return null;
    out.push({ id: c.id, label: c.label });
  }
  return out;
}

/**
 * Validates and returns pending state from a JSON metadata value (e.g. DB jsonb).
 */
export function parsePendingImageIntakeFromMetadataValue(raw: unknown): PendingImageIntakeResolution | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.intakeId !== "string" || !raw.intakeId.trim()) return null;
  const factBundle = parseFactBundle(raw.factBundle);
  if (!factBundle) return null;
  const actionPlan = parseActionPlan(raw.actionPlan);
  if (!actionPlan) return null;
  if (typeof raw.bindingState !== "string") return null;
  const candidates = parseCandidates(raw.candidates);
  if (candidates === null) return null;
  if (raw.imageNameSignal !== null && typeof raw.imageNameSignal !== "string") return null;
  if (raw.inputType !== null && typeof raw.inputType !== "string") return null;
  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) return null;

  const pending: PendingImageIntakeResolution = {
    intakeId: raw.intakeId,
    factBundle,
    actionPlan,
    bindingState: raw.bindingState,
    candidates,
    imageNameSignal: raw.imageNameSignal as string | null,
    inputType: raw.inputType as string | null,
    createdAt: raw.createdAt,
  };

  if (isPendingImageIntakeResolutionExpired(pending)) return null;
  return pending;
}

/**
 * If the in-memory session has no pending resolution, restore from conversation metadata (DB hydration).
 */
export function applyPendingImageIntakeFromConversationMetadata(
  session: AssistantSession,
  metadata: Record<string, unknown> | null | undefined,
): void {
  if (session.pendingImageIntakeResolution) return;

  const raw = metadata?.[PENDING_IMAGE_INTAKE_METADATA_KEY];
  if (raw === undefined || raw === null) return;

  const parsed = parsePendingImageIntakeFromMetadataValue(raw);
  if (!parsed) return;

  session.pendingImageIntakeResolution = parsed;
}
