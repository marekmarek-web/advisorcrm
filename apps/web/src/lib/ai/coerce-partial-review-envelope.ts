/**
 * Best-effort coercion when LLM JSON fails strict Zod validation.
 * Fills missing extractedField.status, fixes enums, clamps numbers — then re-validates.
 */

import type { ClassificationResult } from "./document-classification";
import type { ContractDocumentType } from "./document-classification";
import type { DocumentReviewEnvelope } from "./document-review-types";
import {
  documentReviewEnvelopeSchema,
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  EXTRACTION_FIELD_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
} from "./document-review-types";

const PRIMARY_SET = new Set<string>(PRIMARY_DOCUMENT_TYPES);
const LIFECYCLE_SET = new Set<string>(DOCUMENT_LIFECYCLE_STATUSES);
const INTENT_SET = new Set<string>(DOCUMENT_INTENTS);
const FIELD_STATUS_SET = new Set<string>(EXTRACTION_FIELD_STATUSES);

export function parseJsonObjectFromAiReviewRaw(raw: string): Record<string, unknown> | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(jsonStr) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function clamp01(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeExtractedFieldCell(key: string, v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    const o = { ...(v as Record<string, unknown>) };
    const st = o.status;
    if (typeof st !== "string" || !FIELD_STATUS_SET.has(st)) {
      o.status = "inferred_low_confidence";
    }
    if (o.confidence != null) {
      o.confidence = clamp01(o.confidence, 0.5);
    }
    return o;
  }
  return {
    value: v,
    status: "inferred_low_confidence",
    confidence: 0.45,
  };
}

function coerceExtractedFields(raw: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (key.startsWith("_")) continue;
    out[key] = normalizeExtractedFieldCell(key, val);
  }
  return out;
}

function coerceDocumentMeta(dm: unknown): Record<string, unknown> {
  const base =
    dm && typeof dm === "object" && !Array.isArray(dm) ? { ...(dm as Record<string, unknown>) } : {};
  const svd = base.scannedVsDigital;
  if (svd !== "scanned" && svd !== "digital" && svd !== "unknown") {
    base.scannedVsDigital = "unknown";
  }
  if (base.pageCount != null) {
    const p = base.pageCount;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1) {
      delete base.pageCount;
    }
  }
  if (base.overallConfidence != null) {
    base.overallConfidence = clamp01(base.overallConfidence, 0.5);
  }
  if (base.textCoverageEstimate != null) {
    base.textCoverageEstimate = clamp01(base.textCoverageEstimate, 0);
  }
  return base;
}

function coerceDocumentClassification(
  raw: unknown,
  forcedPrimaryType: ContractDocumentType,
  classification: ClassificationResult
): Record<string, unknown> {
  const dc =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  const pt = dc.primaryType;
  dc.primaryType = typeof pt === "string" && PRIMARY_SET.has(pt) ? pt : forcedPrimaryType;
  const ls = dc.lifecycleStatus;
  dc.lifecycleStatus =
    typeof ls === "string" && LIFECYCLE_SET.has(ls) ? ls : classification.lifecycleStatus;
  const di = dc.documentIntent;
  dc.documentIntent =
    typeof di === "string" && INTENT_SET.has(di) ? di : classification.documentIntent ?? "reference_only";
  dc.confidence = clamp01(dc.confidence, classification.confidence);
  if (!Array.isArray(dc.reasons)) {
    dc.reasons = Array.isArray(classification.reasons) ? [...classification.reasons] : [];
  } else {
    dc.reasons = dc.reasons.map((r) => String(r)).slice(0, 24);
  }
  if (dc.subtype != null && typeof dc.subtype !== "string") {
    dc.subtype = String(dc.subtype).slice(0, 120);
  }
  return dc;
}

function coerceEvidence(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const e = { ...(item as Record<string, unknown>) };
      if (typeof e.fieldKey !== "string" || !e.fieldKey.trim()) {
        e.fieldKey = `field_${i}`;
      }
      const st = e.status;
      e.status = typeof st === "string" && FIELD_STATUS_SET.has(st) ? st : "extracted";
      return e;
    })
    .filter((x): x is Record<string, unknown> => x != null);
}

function coerceReviewWarnings(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      if (!w || typeof w !== "object" || Array.isArray(w)) return null;
      const o = w as Record<string, unknown>;
      const code = typeof o.code === "string" ? o.code : "coerced_warning";
      const message = typeof o.message === "string" ? o.message : String(o.message ?? "");
      if (!message.trim()) return null;
      const sev = o.severity;
      const severity =
        sev === "info" || sev === "warning" || sev === "critical" ? sev : "warning";
      return { code, message, field: o.field, severity };
    })
    .filter(Boolean);
}

function coerceSuggestedActions(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) return null;
      const o = a as Record<string, unknown>;
      const type = typeof o.type === "string" && o.type.trim() ? o.type : "workflow_suggestion";
      const label = typeof o.label === "string" && o.label.trim() ? o.label : "Návrh kroku";
      const payload =
        o.payload && typeof o.payload === "object" && !Array.isArray(o.payload)
          ? o.payload
          : {};
      return { type, label, payload };
    })
    .filter(Boolean);
}

/**
 * Mutates a shallow-cloned envelope-shaped object, then runs `documentReviewEnvelopeSchema.safeParse`.
 */
export function tryCoerceReviewEnvelopeAfterValidationFailure(
  parsed: Record<string, unknown>,
  forcedPrimaryType: ContractDocumentType,
  classification: ClassificationResult
): DocumentReviewEnvelope | null {
  let draft: Record<string, unknown>;
  try {
    draft = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  } catch {
    return null;
  }

  draft.documentClassification = coerceDocumentClassification(
    draft.documentClassification,
    forcedPrimaryType,
    classification
  );
  draft.documentMeta = coerceDocumentMeta(draft.documentMeta);
  draft.extractedFields = coerceExtractedFields(draft.extractedFields);
  if (draft.parties == null || typeof draft.parties !== "object" || Array.isArray(draft.parties)) {
    draft.parties = {};
  }
  if (!Array.isArray(draft.productsOrObligations)) {
    draft.productsOrObligations = [];
  }
  if (draft.financialTerms == null || typeof draft.financialTerms !== "object" || Array.isArray(draft.financialTerms)) {
    draft.financialTerms = {};
  }
  if (draft.serviceTerms == null || typeof draft.serviceTerms !== "object" || Array.isArray(draft.serviceTerms)) {
    draft.serviceTerms = {};
  }
  draft.evidence = coerceEvidence(draft.evidence);
  draft.reviewWarnings = coerceReviewWarnings(draft.reviewWarnings);
  draft.suggestedActions = coerceSuggestedActions(draft.suggestedActions);

  if (draft.candidateMatches != null && (typeof draft.candidateMatches !== "object" || Array.isArray(draft.candidateMatches))) {
    delete draft.candidateMatches;
  }
  if (draft.dataCompleteness != null && (typeof draft.dataCompleteness !== "object" || Array.isArray(draft.dataCompleteness))) {
    delete draft.dataCompleteness;
  }
  if (draft.sectionSensitivity != null && (typeof draft.sectionSensitivity !== "object" || Array.isArray(draft.sectionSensitivity))) {
    draft.sectionSensitivity = {};
  }

  const result = documentReviewEnvelopeSchema.safeParse(draft);
  return result.success ? result.data : null;
}

/**
 * When coercion still fails, copy any parseable extractedFields / parties into the manual-review stub
 * so the UI can show partial rows.
 */
export function mergePartialParsedIntoManualStub(
  stub: DocumentReviewEnvelope,
  parsed: Record<string, unknown> | null,
  rawCharLength: number
): { mergedFieldKeys: string[]; mergedPartyKeys: string[] } {
  const mergedFieldKeys: string[] = [];
  const mergedPartyKeys: string[] = [];
  if (!parsed) {
    stub.debug = {
      ...(stub.debug ?? {}),
      partialMerge: { attempted: false, rawCharLength },
    };
    return { mergedFieldKeys, mergedPartyKeys };
  }

  const ef = parsed.extractedFields;
  if (ef && typeof ef === "object" && !Array.isArray(ef)) {
    for (const [k, v] of Object.entries(ef as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      stub.extractedFields[k] = normalizeExtractedFieldCell(k, v) as DocumentReviewEnvelope["extractedFields"][string];
      mergedFieldKeys.push(k);
    }
  }

  const parties = parsed.parties;
  if (parties && typeof parties === "object" && !Array.isArray(parties)) {
    for (const [k, v] of Object.entries(parties as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      stub.parties[k] = v;
      mergedPartyKeys.push(k);
    }
  }

  const topKeys = Object.keys(parsed).filter((k) => !k.startsWith("_")).slice(0, 32);
  stub.debug = {
    ...(stub.debug ?? {}),
    partialMerge: {
      attempted: true,
      rawCharLength,
      topLevelKeys: topKeys,
      mergedExtractedFieldCount: mergedFieldKeys.length,
      mergedPartyCount: mergedPartyKeys.length,
    },
  };

  return { mergedFieldKeys, mergedPartyKeys };
}
