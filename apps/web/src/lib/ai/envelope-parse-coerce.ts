/**
 * Coerce LLM JSON toward documentReviewEnvelopeSchema before Zod parse.
 * Reduces soft-fail stubs when the model drifts slightly on enums or empty subtype.
 */

import { PRIMARY_DOCUMENT_TYPES, DOCUMENT_LIFECYCLE_STATUSES, DOCUMENT_INTENTS } from "./document-review-types";

const PRIMARY_SET = new Set<string>(PRIMARY_DOCUMENT_TYPES);
const LIFECYCLE_SET = new Set<string>(DOCUMENT_LIFECYCLE_STATUSES);
const INTENT_SET = new Set<string>(DOCUMENT_INTENTS);
const SCANNED_VS_DIGITAL_VALUES = new Set(["scanned", "digital", "unknown"]);

/** Lowercase keys; map to canonical lifecycle enum values. */
const LIFECYCLE_ALIASES: Record<string, string> = {
  illustration_phase: "illustration",
  modelace: "modelation",
  návrh: "proposal",
  navrh: "proposal",
  nabidka: "offer",
  nabídka: "offer",
  projekce: "non_binding_projection",
  nezávazná_projekce: "non_binding_projection",
  nezavazna_projekce: "non_binding_projection",
  non_binding: "non_binding_projection",
  nezávazné: "non_binding_projection",
};

export type EnvelopeCoerceMode = "light" | "aggressive";

export type CoerceEnvelopeOptions = {
  mode: EnvelopeCoerceMode;
  /** When set and valid, used to fix or align documentClassification.primaryType. */
  expectedPrimaryType?: string;
};

function deepCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Returns a cloned object with documentClassification coerced. Non-objects are returned as-is.
 */
export function coerceReviewEnvelopeParsedJson(input: unknown, options: CoerceEnvelopeOptions): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const root = deepCloneJson(input) as Record<string, unknown>;
  const dcIn = root.documentClassification;
  if (!dcIn || typeof dcIn !== "object" || Array.isArray(dcIn)) {
    // Create a minimal documentClassification when missing
    if (options.expectedPrimaryType && PRIMARY_SET.has(options.expectedPrimaryType)) {
      root.documentClassification = {
        primaryType: options.expectedPrimaryType,
        lifecycleStatus: "unknown",
        documentIntent: "reference_only",
        confidence: 0.5,
        reasons: [],
      };
    }
    return root;
  }
  const dc = { ...(dcIn as Record<string, unknown>) };
  const exp = options.expectedPrimaryType;

  if (exp && PRIMARY_SET.has(exp)) {
    if (options.mode === "aggressive") {
      dc.primaryType = exp;
    } else {
      const pt = dc.primaryType;
      if (typeof pt !== "string" || !PRIMARY_SET.has(pt)) {
        dc.primaryType = exp;
      }
    }
  } else if (options.mode === "aggressive") {
    const pt = dc.primaryType;
    if (typeof pt !== "string" || !PRIMARY_SET.has(pt)) {
      dc.primaryType = "unsupported_or_unknown";
    }
  }

  if (dc.subtype === "" || dc.subtype === null) {
    delete dc.subtype;
  }

  const lcRaw = dc.lifecycleStatus;
  if (typeof lcRaw === "string") {
    const trimmed = lcRaw.trim();
    const normKey = trimmed.toLowerCase().replace(/\s+/g, "_");
    const aliased = LIFECYCLE_ALIASES[normKey];
    if (aliased && LIFECYCLE_SET.has(aliased)) {
      dc.lifecycleStatus = aliased;
    } else if (LIFECYCLE_SET.has(trimmed)) {
      dc.lifecycleStatus = trimmed;
    } else if (LIFECYCLE_SET.has(normKey)) {
      dc.lifecycleStatus = normKey;
    } else {
      dc.lifecycleStatus = "unknown";
    }
  } else {
    dc.lifecycleStatus = "unknown";
  }

  // Fix documentIntent enum if it's invalid or missing
  if (dc.documentIntent == null || typeof dc.documentIntent !== "string" || !INTENT_SET.has(dc.documentIntent)) {
    dc.documentIntent = "reference_only";
  }

  // Ensure confidence is present and valid (required by Zod schema)
  if (dc.confidence == null || typeof dc.confidence !== "number" || !Number.isFinite(dc.confidence as number)) {
    dc.confidence = 0.5;
  } else {
    const rawConf = dc.confidence as number;
    dc.confidence = rawConf > 1 ? Math.min(1, rawConf / 100) : Math.max(0, Math.min(1, rawConf));
  }

  // Ensure reasons is an array
  if (!Array.isArray(dc.reasons)) {
    dc.reasons = [];
  }

  root.documentClassification = dc;

  // Clamp per-field confidence in extractedFields to [0, 1] before Zod parse
  // (LLMs sometimes return integer percentages like 85 instead of 0.85)
  const efIn = root.extractedFields;
  if (efIn && typeof efIn === "object" && !Array.isArray(efIn)) {
    const ef = efIn as Record<string, unknown>;
    for (const [key, fieldVal] of Object.entries(ef)) {
      if (fieldVal && typeof fieldVal === "object" && !Array.isArray(fieldVal)) {
        const fObj = fieldVal as Record<string, unknown>;
        if (typeof fObj.confidence === "number" && Number.isFinite(fObj.confidence)) {
          if (fObj.confidence > 1) {
            fObj.confidence = Math.min(1, fObj.confidence / 100);
          } else if (fObj.confidence < 0) {
            fObj.confidence = 0;
          }
        }
      }
    }
  }

  // Fix documentMeta: scannedVsDigital must be one of "scanned" | "digital" | "unknown"
  const dmIn = root.documentMeta;
  if (dmIn && typeof dmIn === "object" && !Array.isArray(dmIn)) {
    const dm = { ...(dmIn as Record<string, unknown>) };
    const svd = dm.scannedVsDigital;
    if (typeof svd !== "string" || !SCANNED_VS_DIGITAL_VALUES.has(svd)) {
      dm.scannedVsDigital = "unknown";
    }
    // Clamp overallConfidence to [0, 1]
    if (typeof dm.overallConfidence === "number") {
      dm.overallConfidence =
        dm.overallConfidence > 1
          ? Math.min(1, dm.overallConfidence / 100)
          : Math.max(0, Math.min(1, dm.overallConfidence));
    }
    root.documentMeta = dm;
  } else if (!dmIn) {
    // If documentMeta is missing entirely, provide minimal valid shape
    root.documentMeta = { scannedVsDigital: "unknown" };
  }

  return root;
}
