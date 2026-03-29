import type { InputMode } from "../ai/input-mode-detection";
import type { ExtractedField } from "./types";

export type ReadabilityContext = {
  inputMode?: InputMode | string;
  textCoverageEstimate?: number;
  preprocessStatus?: string;
};

const TEXT_COVERAGE_OK = 0.55;
const FIELD_CONFIDENCE_OK = 0.72;

/** When true, avoid generic "lower confidence" copy on every field (text PDF + good coverage). */
export function isHighTrustReadingContext(ctx: ReadabilityContext): boolean {
  if (ctx.inputMode !== "text_pdf") return false;
  if (typeof ctx.textCoverageEstimate === "number" && ctx.textCoverageEstimate < TEXT_COVERAGE_OK) {
    return false;
  }
  if (ctx.preprocessStatus === "failed") return false;
  return true;
}

export function fieldNumericConfidence(field: { confidence?: number }): number {
  const c = field.confidence;
  if (typeof c === "number" && Number.isFinite(c)) return Math.round(c * 100);
  return 100;
}

/**
 * Maps extraction status + confidence to UI field status and optional advisor message.
 */
export function advisorFieldPresentation(
  rawValue: unknown,
  extractionStatus: string | undefined,
  fieldConf01: number | undefined,
  ctx: ReadabilityContext
): { status: "success" | "warning" | "error"; message?: string } {
  const empty =
    rawValue == null ||
    rawValue === "" ||
    rawValue === "—" ||
    (typeof rawValue === "string" && rawValue.trim() === "");

  const extracted =
    extractionStatus === "extracted" ||
    extractionStatus === "inferred_low_confidence" ||
    (!extractionStatus && !empty);

  if (empty || extractionStatus === "missing" || extractionStatus === "not_found") {
    return {
      status: "error",
      message: "Údaj nebyl nalezen nebo chybí v dokumentu.",
    };
  }

  const confPct =
    typeof fieldConf01 === "number" && Number.isFinite(fieldConf01)
      ? Math.round(fieldConf01 * 100)
      : 100;

  if (extractionStatus === "inferred_low_confidence") {
    return {
      status: "warning",
      message: "Odhad z kontextu — ověřte oproti originálu.",
    };
  }

  if (confPct < 50) {
    return {
      status: "warning",
      message: "Nízká jistota modelu — ověřte oproti originálu dokumentu.",
    };
  }

  if (confPct < 85 && !isHighTrustReadingContext(ctx)) {
    return {
      status: "warning",
      message: "Nižší jistota čtení. Ověřte prosím oproti originálu dokumentu.",
    };
  }

  if (confPct < 85 && isHighTrustReadingContext(ctx) && extracted) {
    return { status: "success" };
  }

  return { status: "success" };
}

export function shouldCountFieldForAttentionBanner(field: ExtractedField): boolean {
  if (field.status === "error") return true;
  if (field.status === "warning" && field.message?.includes("Nízká jistota")) return true;
  if (field.status === "warning" && field.message?.includes("Odhad z kontextu")) return true;
  return false;
}
