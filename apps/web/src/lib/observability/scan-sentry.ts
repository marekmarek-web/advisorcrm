import * as Sentry from "@sentry/nextjs";

/**
 * Sentry breadcrumbs + signals for the document scan funnel:
 * - Native Capacitor scanner errors (permission, ML Kit missing, plugin unavailable).
 * - AI Review page-image fallback recoveries / failures (feature-flagged upgrade path).
 *
 * All functions are `try/catch`-guarded so instrumentation never crashes the request.
 */

export type NativeScanErrorCodeForTelemetry =
  | "cancelled"
  | "permission_denied"
  | "plugin_unavailable"
  | "ml_kit_unavailable"
  | "no_usable_files"
  | "unknown";

export type ScanTier = "web" | "web_mobile" | "native_capacitor" | "unknown";

export type ScanPlatform = "ios" | "android" | "web" | "unknown";

export function breadcrumbNativeScanAttempt(ctx: {
  tier: ScanTier;
  platform: ScanPlatform;
  maxPages: number;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "scan.native.attempt",
      type: "default",
      level: "info",
      message: "native_scan_attempt",
      data: {
        tier: ctx.tier,
        platform: ctx.platform,
        maxPages: ctx.maxPages,
      },
    });
  } catch {
    /* ignore */
  }
}

export function breadcrumbNativeScanSuccess(ctx: {
  tier: ScanTier;
  platform: ScanPlatform;
  pageCount: number;
  elapsedMs: number;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "scan.native.success",
      type: "default",
      level: "info",
      message: "native_scan_success",
      data: {
        tier: ctx.tier,
        platform: ctx.platform,
        pageCount: ctx.pageCount,
        elapsedMs: ctx.elapsedMs,
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Record a structured scan error. `cancelled` is breadcrumb-only (not captured), the rest
 * is captured as a warning with a stable fingerprint so we get one Sentry issue per code+platform.
 */
export function captureNativeScanError(ctx: {
  code: NativeScanErrorCodeForTelemetry;
  platform: ScanPlatform;
  tier: ScanTier;
  message: string;
  appVersion?: string;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "scan.native.error",
      type: "error",
      level: ctx.code === "cancelled" ? "info" : "warning",
      message: `native_scan_${ctx.code}`,
      data: {
        code: ctx.code,
        platform: ctx.platform,
        tier: ctx.tier,
        message: ctx.message.slice(0, 300),
      },
    });
    if (ctx.code === "cancelled") return;

    Sentry.withScope((scope) => {
      scope.setTag("feature", "document_scan");
      scope.setTag("scan_tier", ctx.tier);
      scope.setTag("scan_platform", ctx.platform);
      scope.setTag("scan_error_code", ctx.code);
      if (ctx.appVersion) scope.setTag("app_version", ctx.appVersion);
      scope.setFingerprint(["native-scan-error", ctx.code, ctx.platform]);
      scope.setContext("native_scan_error", {
        code: ctx.code,
        platform: ctx.platform,
        tier: ctx.tier,
        message: ctx.message.slice(0, 1000),
      });
      Sentry.captureMessage(
        `native_scan_${ctx.code}: ${ctx.message.slice(0, 160)}`,
        "warning"
      );
    });
  } catch {
    /* ignore */
  }
}

export function breadcrumbPageImageFallbackRecovery(ctx: {
  reviewId?: string;
  documentType?: string;
  recoveredFieldKeys: string[];
  failedAttempts: number;
  attemptedCount: number;
  tenantId?: string;
}): void {
  try {
    const recovered = ctx.recoveredFieldKeys.slice(0, 12);
    Sentry.addBreadcrumb({
      category: "ai_review.page_image_fallback",
      type: "default",
      level: ctx.failedAttempts > 0 ? "warning" : "info",
      message:
        ctx.recoveredFieldKeys.length > 0
          ? "page_image_fallback_recovered"
          : "page_image_fallback_noop",
      data: {
        reviewId: ctx.reviewId?.slice(0, 36),
        tenantId: ctx.tenantId?.slice(0, 36),
        documentType: ctx.documentType,
        attemptedCount: ctx.attemptedCount,
        recoveredCount: ctx.recoveredFieldKeys.length,
        failedAttempts: ctx.failedAttempts,
        recoveredFields: recovered,
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Called when the whole fallback block throws. Contrast with per-field failures — those
 * are counted in `failedAttempts` and don't get their own capture.
 */
export function capturePageImageFallbackError(ctx: {
  reviewId?: string;
  tenantId?: string;
  documentType?: string;
  error: string;
}): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "ai_review_page_image_fallback");
      if (ctx.tenantId) scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      if (ctx.documentType) scope.setTag("document_type", ctx.documentType);
      scope.setFingerprint([
        "page-image-fallback-error",
        ctx.documentType ?? "unknown",
      ]);
      scope.setContext("page_image_fallback", {
        reviewId: ctx.reviewId?.slice(0, 36),
        documentType: ctx.documentType,
        error: ctx.error.slice(0, 2000),
      });
      Sentry.captureMessage(
        `page_image_fallback: ${ctx.error.slice(0, 200)}`,
        "warning"
      );
    });
  } catch {
    /* ignore */
  }
}
