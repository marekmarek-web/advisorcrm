/**
 * Contract review: `scan_pending_ocr` must not pretend an async OCR job is still running forever.
 * After a wall-clock limit, transition to failed + retryable (POST /process again).
 */

import "server-only";

import { logAudit } from "@/lib/audit";
import {
  getContractReviewById,
  updateContractReview,
  type ContractReviewRow,
  type ExtractionTrace,
} from "@/lib/ai/review-queue-repository";
import {
  DEFAULT_OCR_SCAN_PENDING_MAX_MS,
  resolveOcrScanPendingMaxMs,
  shouldExpireScanPendingOcr,
} from "@/lib/contracts/ocr-scan-pending-policy";

export { DEFAULT_OCR_SCAN_PENDING_MAX_MS } from "@/lib/contracts/ocr-scan-pending-policy";
export {
  getScanPendingStartMs,
  msUntilScanPendingExpiry,
  shouldExpireScanPendingOcr,
} from "@/lib/contracts/ocr-scan-pending-policy";

export function getOcrScanPendingMaxMs(): number {
  return resolveOcrScanPendingMaxMs();
}

export const OCR_WATCHDOG_TIMEOUT_USER_MESSAGE =
  "Čekání na čitelný text ze skenu překročilo časový limit serveru. Stav je ukončen — můžete znovu spustit zpracování (nebo nahrát PDF s textovou vrstvou).";

/**
 * If row is `scan_pending_ocr` longer than the limit, set failed + retryable trace. Returns fresh row or null.
 */
export async function expireStaleScanPendingOcrIfNeeded(
  row: ContractReviewRow,
  tenantId: string,
  opts?: { userId?: string | null }
): Promise<ContractReviewRow | null> {
  if (row.processingStatus !== "scan_pending_ocr") return null;

  const prevTrace = (row.extractionTrace ?? {}) as Record<string, unknown>;
  if (prevTrace.ocrWatchdogExpired === true) return null;

  if (!shouldExpireScanPendingOcr(prevTrace, row.updatedAt, Date.now(), resolveOcrScanPendingMaxMs())) return null;

  const mergedTrace: ExtractionTrace = {
    ...(row.extractionTrace as ExtractionTrace | undefined),
    ocrWatchdogExpired: true,
    ocrWatchdogExpiredAtMs: Date.now(),
    ocrWatchdogReason: "scan_pending_ocr_timeout",
    scanPendingReason: typeof prevTrace.scanPendingReason === "string" ? prevTrace.scanPendingReason : undefined,
  };

  await updateContractReview(row.id, tenantId, {
    processingStatus: "failed",
    processingStage: null,
    errorMessage: OCR_WATCHDOG_TIMEOUT_USER_MESSAGE,
    extractionTrace: mergedTrace,
  });

  await logAudit({
    tenantId,
    userId: opts?.userId ?? null,
    action: "ocr_scan_pending_watchdog",
    entityType: "contract_review",
    entityId: row.id,
    meta: {
      reason: "scan_pending_ocr_timeout",
      ocrScanPendingSinceMs: prevTrace.ocrScanPendingSinceMs,
    },
  }).catch(() => {});

  const fresh = await getContractReviewById(row.id, tenantId);
  return fresh ?? null;
}
