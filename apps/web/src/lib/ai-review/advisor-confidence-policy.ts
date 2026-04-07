import type { InputMode } from "../ai/input-mode-detection";
import type { ExtractedField } from "./types";
import type { EvidenceTier, SourceKind } from "../ai/document-review-types";

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

// ─── Evidence tier → advisor-facing display ───────────────────────────────────

/**
 * Converts the internal evidenceTier to a simple advisor-facing label.
 * No debug vocabulary exposed.
 */
export function evidenceTierToAdvisorLabel(
  tier: EvidenceTier | undefined
): "Nalezeno" | "Odvozeno" | "Chybí" {
  if (!tier || tier === "missing") return "Chybí";
  if (
    tier === "explicit_labeled_field" ||
    tier === "explicit_table_field" ||
    tier === "explicit_section_block" ||
    tier === "normalized_alias_match"
  ) return "Nalezeno";
  return "Odvozeno";
}

/**
 * Converts sourceKind to an advisor-friendly source description.
 * Returns empty string if no source kind is available.
 */
export function sourceKindToAdvisorLabel(kind: SourceKind | undefined, sourceLabel?: string): string {
  if (sourceLabel) return sourceLabel;
  if (!kind || kind === "unknown" || kind === "pipeline_normalized") return "";
  const MAP: Partial<Record<SourceKind, string>> = {
    client_block: "z bloku Klient",
    policyholder_block: "z bloku Pojistník",
    borrower_block: "z bloku Dlužník",
    owner_block: "z bloku Vlastník",
    investor_block: "z bloku Investor",
    intermediary_block: "z bloku Zprostředkovatel",
    insurer_header: "z hlavičky pojišťovny",
    bank_header: "z hlavičky banky",
    provider_header: "z hlavičky poskytovatele",
    payment_block: "z tabulky plateb",
    product_block: "z produktového bloku",
    contract_block: "ze smluvní tabulky",
    parties_record: "ze seznamu účastníků",
  };
  return MAP[kind] ?? "";
}

/**
 * Combined advisor field presentation that incorporates evidence tier and source kind
 * in addition to the existing status/confidence logic.
 */
export function advisorFieldPresentationWithEvidence(
  rawValue: unknown,
  extractionStatus: string | undefined,
  fieldConf01: number | undefined,
  ctx: ReadabilityContext,
  evidenceTier?: EvidenceTier,
  sourceKind?: SourceKind,
  sourceLabel?: string,
): {
  status: "success" | "warning" | "error";
  message?: string;
  displayStatus: "Nalezeno" | "Odvozeno" | "Chybí";
  displaySource: string;
} {
  const base = advisorFieldPresentation(rawValue, extractionStatus, fieldConf01, ctx);
  const displayStatus = evidenceTierToAdvisorLabel(evidenceTier);
  const displaySource = sourceKindToAdvisorLabel(sourceKind, sourceLabel);

  // If evidence says it's inferred but status would show as success, add context
  let message = base.message;
  if (!message && displayStatus === "Odvozeno" && base.status === "success") {
    message = "Odvozeno z kontextu — ověřte oproti originálu.";
  }

  return { ...base, message, displayStatus, displaySource };
}
