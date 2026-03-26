import { describe, it, expect } from "vitest";
import {
  shouldSkipContractLlmExtractionForScanOcr,
  SCAN_OCR_EXTRACTION_MIN_HINT_CHARS,
} from "../scan-ocr-extraction-gate";

describe("scan-ocr-extraction-gate", () => {
  it("does not skip when not scan fallback", () => {
    expect(
      shouldSkipContractLlmExtractionForScanOcr({
        isScanFallback: false,
        hintLength: 0,
        preprocessStatus: "failed",
      })
    ).toBe(false);
  });

  it("does not skip scan when hint is long enough", () => {
    expect(
      shouldSkipContractLlmExtractionForScanOcr({
        isScanFallback: true,
        hintLength: SCAN_OCR_EXTRACTION_MIN_HINT_CHARS,
        preprocessStatus: "failed",
      })
    ).toBe(false);
  });

  it("skips scan when hint very short", () => {
    expect(
      shouldSkipContractLlmExtractionForScanOcr({
        isScanFallback: true,
        hintLength: 100,
        preprocessStatus: "completed",
        readabilityScore: 90,
      })
    ).toBe(true);
  });

  it("skips scan when hint medium but preprocess weak", () => {
    expect(
      shouldSkipContractLlmExtractionForScanOcr({
        isScanFallback: true,
        hintLength: 500,
        preprocessStatus: "partial",
        readabilityScore: 80,
      })
    ).toBe(true);
  });
});
