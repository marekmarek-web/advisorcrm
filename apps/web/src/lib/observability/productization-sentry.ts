import * as Sentry from "@sentry/nextjs";

/**
 * Phase 7 — Sentry instrumentation for productization layer.
 *
 * Covers:
 * - entitlement check failures (paid feature accessed without entitlement)
 * - subscription sync failures (webhook / upsert errors)
 * - tenant boundary violations (cross-tenant data leakage attempts)
 * - role/permission boundary violations
 * - billing grace-period edge cases
 *
 * All helpers are safe no-ops if Sentry throws.
 */

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* ignore */
  }
}

// ─── Entitlement ──────────────────────────────────────────────────────────────

export function captureEntitlementViolation(ctx: {
  tenantId: string;
  userId: string;
  entitlementKey: string;
  action: string;
  reason?: string;
}): void {
  safe(() => {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "entitlement_gate");
      scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      scope.setTag("entitlement_key", ctx.entitlementKey.slice(0, 64));
      scope.setFingerprint(["entitlement-violation", ctx.entitlementKey, ctx.action]);
      scope.setContext("entitlement", {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entitlementKey: ctx.entitlementKey,
        action: ctx.action,
        reason: ctx.reason ?? null,
      });
      Sentry.captureMessage(
        `Entitlement violation: ${ctx.entitlementKey} for action ${ctx.action}`,
        "warning"
      );
    });
  });
}

// ─── Subscription sync ────────────────────────────────────────────────────────

export function captureSubscriptionSyncFailure(ctx: {
  tenantId: string | null;
  stripeEventId?: string;
  stripeSubscriptionId?: string;
  error: unknown;
}): void {
  safe(() => {
    const err = ctx.error instanceof Error ? ctx.error : new Error(String(ctx.error));
    Sentry.withScope((scope) => {
      scope.setTag("feature", "subscription_sync");
      if (ctx.tenantId) scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      scope.setFingerprint(["subscription-sync-failure", err.message.slice(0, 100)]);
      scope.setContext("subscription_sync", {
        tenantId: ctx.tenantId,
        stripeEventId: ctx.stripeEventId ?? null,
        stripeSubscriptionId: ctx.stripeSubscriptionId ?? null,
        error: err.message.slice(0, 500),
      });
      Sentry.captureException(err);
    });
  });
}

// ─── Tenant boundary ──────────────────────────────────────────────────────────

export function captureTenantBoundaryViolation(ctx: {
  requestTenantId: string;
  dataTenantId: string;
  userId: string;
  resource: string;
  resourceId?: string;
}): void {
  safe(() => {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "tenant_boundary");
      scope.setTag("tenant_id", ctx.requestTenantId.slice(0, 36));
      scope.setFingerprint(["tenant-boundary-violation", ctx.resource]);
      scope.setContext("tenant_boundary", {
        requestTenantId: ctx.requestTenantId,
        dataTenantId: ctx.dataTenantId,
        userId: ctx.userId,
        resource: ctx.resource,
        resourceId: ctx.resourceId ?? null,
      });
      Sentry.captureMessage(
        `Tenant boundary violation: ${ctx.resource} belongs to different tenant`,
        "error"
      );
    });
  });
}

// ─── Role/permission boundary ─────────────────────────────────────────────────

export function capturePermissionViolation(ctx: {
  tenantId: string;
  userId: string;
  roleName: string;
  requiredPermission: string;
  action: string;
}): void {
  safe(() => {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "permission_gate");
      scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      scope.setTag("role_name", ctx.roleName);
      scope.setFingerprint(["permission-violation", ctx.roleName, ctx.requiredPermission]);
      scope.setContext("permission_check", {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        roleName: ctx.roleName,
        requiredPermission: ctx.requiredPermission,
        action: ctx.action,
      });
      Sentry.captureMessage(
        `Permission violation: role ${ctx.roleName} lacks ${ctx.requiredPermission}`,
        "warning"
      );
    });
  });
}

// ─── Billing grace period ─────────────────────────────────────────────────────

export function captureGracePeriodEntry(ctx: {
  tenantId: string;
  subscriptionStatus: string;
  graceDaysRemaining: number;
  plan: string | null;
}): void {
  safe(() => {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "billing_grace");
      scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      scope.setTag("subscription_status", ctx.subscriptionStatus);
      scope.setFingerprint(["billing-grace-period", ctx.tenantId]);
      scope.setContext("billing_grace", {
        tenantId: ctx.tenantId,
        status: ctx.subscriptionStatus,
        graceDaysRemaining: ctx.graceDaysRemaining,
        plan: ctx.plan,
      });
      Sentry.captureMessage(
        `Workspace in billing grace period: ${ctx.graceDaysRemaining}d remaining`,
        "warning"
      );
    });
  });
}
