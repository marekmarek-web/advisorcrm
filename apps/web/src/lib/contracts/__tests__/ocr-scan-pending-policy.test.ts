import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_OCR_SCAN_PENDING_MAX_MS,
  formatOcrRegressionLabLine,
  msUntilScanPendingExpiry,
  shouldExpireScanPendingOcr,
} from "@/lib/contracts/ocr-scan-pending-policy";
import { USABLE_TEXT_MIN } from "@/lib/contracts/contract-review-scan-gate";

describe("OCR scan-pending watchdog policy", () => {
  const updatedAt = new Date("2026-04-15T12:00:00.000Z");

  beforeEach(() => {
    vi.stubEnv("OCR_SCAN_PENDING_MAX_MS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pending -> timeout: crosses limit after max window from ocrScanPendingSinceMs", () => {
    const since = Date.parse("2026-04-15T12:00:00.000Z");
    const trace = { ocrScanPendingSinceMs: since };
    const now = since + DEFAULT_OCR_SCAN_PENDING_MAX_MS + 1000;
    expect(shouldExpireScanPendingOcr(trace, updatedAt, now, DEFAULT_OCR_SCAN_PENDING_MAX_MS)).toBe(true);
  });

  it("timeout -> retryable state: scorecard line for failed + ocrWatchdogExpired", () => {
    const line = formatOcrRegressionLabLine({
      processingStatus: "failed",
      ocrWatchdogExpired: true,
    });
    expect(line).toBe("ocr_lifecycle=failed_retryable(ocr_watchdog_timeout)");
  });

  it("truthful UI message: scan_pending exposes remaining window", () => {
    const since = Date.parse("2026-04-15T12:00:00.000Z");
    const trace = { ocrScanPendingSinceMs: since };
    const now = since + 5 * 60 * 1000;
    const left = msUntilScanPendingExpiry(trace, updatedAt, now, DEFAULT_OCR_SCAN_PENDING_MAX_MS);
    expect(left).toBe(DEFAULT_OCR_SCAN_PENDING_MAX_MS - 5 * 60 * 1000);
    const line = formatOcrRegressionLabLine({
      processingStatus: "scan_pending_ocr",
      msUntilExpiry: left,
    });
    expect(line).toContain("ocr_lifecycle=scan_pending_ocr");
    expect(line).toContain(String(left));
  });

  it("text layer fallback: preprocess short-Adobe path uses same 400-char floor as scan gate", () => {
    expect(USABLE_TEXT_MIN).toBe(400);
  });
});
