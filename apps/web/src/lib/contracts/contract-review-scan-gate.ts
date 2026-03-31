/**
 * Decides whether **contract review** uploads should defer to `scan_pending_ocr` (no LLM extraction).
 *
 * Scope: `contract_upload_reviews` + `runContractReviewProcessing` only. The general `documents` table
 * uses separate upload/processing paths and does not invoke this gate or the AI Review pipeline.
 * When deferred, processing stops before `runContractUnderstandingPipeline` until OCR improves text.
 */

import { detectInputMode } from "@/lib/ai/input-mode-detection";
import type { PreprocessResult } from "@/lib/documents/processing/preprocess-for-ai";

const USABLE_TEXT_MIN = 400;
const USABLE_TEXT_ALT = 200;
const READABILITY_OK = 68;

export type ScanGateResult =
  | { defer: true; reason: string }
  | { defer: false; reason: string };

/**
 * If preprocess did not yield enough text and the file looks like a scan/image, defer to OCR queue.
 */
export async function evaluateContractReviewScanGate(
  fileUrl: string,
  mimeType: string | null | undefined,
  preprocess: Pick<
    PreprocessResult,
    "markdownContent" | "readabilityScore" | "preprocessStatus" | "preprocessMode"
  >
): Promise<ScanGateResult> {
  const md = preprocess.markdownContent?.trim() ?? "";
  const mime = (mimeType ?? "").toLowerCase();

  if (md.length >= USABLE_TEXT_MIN) {
    return { defer: false, reason: "sufficient_text" };
  }
  if (md.length >= USABLE_TEXT_ALT && (preprocess.readabilityScore ?? 0) >= READABILITY_OK) {
    return { defer: false, reason: "text_with_good_readability" };
  }

  // pdf-parse fallback already proves the file has a text layer — OCR cannot improve it further.
  // Pass any amount of extracted text to the pipeline (file-based LLM will supplement if needed).
  if (preprocess.preprocessMode === "pdf_parse_fallback" && md.length > 0) {
    return { defer: false, reason: "pdf_parse_fallback_has_text" };
  }

  if (mime.startsWith("image/")) {
    return { defer: true, reason: "image_without_usable_text" };
  }

  if (!mime.includes("pdf")) {
    // Word etc. — allow pipeline to try (may fail safely)
    return { defer: false, reason: "non_pdf_non_image" };
  }

  try {
    const mode = await detectInputMode(fileUrl, mimeType);
    if (mode.inputMode === "text_pdf") {
      return { defer: false, reason: "text_pdf_detected" };
    }
    return { defer: true, reason: `scan_like_input_${mode.inputMode}` };
  } catch {
    return { defer: true, reason: "detect_input_mode_failed_assume_scan" };
  }
}
