/**
 * Rules-first gate: skip heavy LLM contract extraction when scan-like input lacks usable OCR text.
 */

export const SCAN_OCR_EXTRACTION_MIN_HINT_CHARS = 800;
const SCAN_OCR_HARD_MIN_CHARS = 400;

export function shouldSkipContractLlmExtractionForScanOcr(params: {
  isScanFallback: boolean;
  hintLength: number;
  preprocessStatus?: string;
  readabilityScore?: number;
  textCoverageEstimate?: number;
}): boolean {
  if (!params.isScanFallback) return false;
  const hint = params.hintLength;
  if (hint >= SCAN_OCR_EXTRACTION_MIN_HINT_CHARS) return false;
  if (hint < SCAN_OCR_HARD_MIN_CHARS) return true;
  const completed = params.preprocessStatus === "completed";
  const lowRead = typeof params.readabilityScore === "number" && params.readabilityScore < 55;
  const lowCov =
    typeof params.textCoverageEstimate === "number" && params.textCoverageEstimate < 0.35;
  return !completed || lowRead || lowCov;
}
