/**
 * Shared OCR scan-pending policy (no server-only) — client + API can show the same limits.
 */

export const DEFAULT_OCR_SCAN_PENDING_MAX_MS = 30 * 60 * 1000;

export function resolveOcrScanPendingMaxMs(): number {
  if (typeof process !== "undefined" && process.env?.OCR_SCAN_PENDING_MAX_MS) {
    const raw = String(process.env.OCR_SCAN_PENDING_MAX_MS).trim();
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (n >= 60_000) return n;
    }
  }
  return DEFAULT_OCR_SCAN_PENDING_MAX_MS;
}

export function getScanPendingStartMs(
  trace: Record<string, unknown> | null | undefined,
  rowUpdatedAt: Date
): number {
  const t = trace?.ocrScanPendingSinceMs;
  if (typeof t === "number" && Number.isFinite(t) && t > 0) return t;
  return rowUpdatedAt.getTime();
}

export function msUntilScanPendingExpiry(
  trace: Record<string, unknown> | null | undefined,
  rowUpdatedAt: Date,
  nowMs: number = Date.now(),
  maxMs: number = resolveOcrScanPendingMaxMs()
): number {
  const start = getScanPendingStartMs(trace, rowUpdatedAt);
  const deadline = start + maxMs;
  return Math.max(0, deadline - nowMs);
}

export function shouldExpireScanPendingOcr(
  trace: Record<string, unknown> | null | undefined,
  rowUpdatedAt: Date,
  nowMs: number = Date.now(),
  maxMs: number = resolveOcrScanPendingMaxMs()
): boolean {
  const start = getScanPendingStartMs(trace, rowUpdatedAt);
  return nowMs - start >= maxMs;
}

/** Batch regression / scorecard (golden lab) — OCR lifecycle string. */
export function formatOcrRegressionLabLine(state: {
  processingStatus: string;
  ocrWatchdogExpired?: boolean;
  msUntilExpiry?: number;
}): string {
  if (state.processingStatus === "scan_pending_ocr") {
    return `ocr_lifecycle=scan_pending_ocr remainingMs=${state.msUntilExpiry ?? "—"}`;
  }
  if (state.processingStatus === "failed" && state.ocrWatchdogExpired) {
    return "ocr_lifecycle=failed_retryable(ocr_watchdog_timeout)";
  }
  return `ocr_lifecycle=${state.processingStatus}`;
}
