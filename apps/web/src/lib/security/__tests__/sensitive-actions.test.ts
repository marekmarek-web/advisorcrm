import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SENSITIVE_ACTIONS,
  getSensitiveAction,
  requireTenantIsolation,
  checkSensitiveAction,
  getSensitiveActionsForRole,
  isHighRiskAction,
  type SensitiveActionType,
  type SensitiveActionContext,
} from "../sensitive-actions";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { logAudit } from "@/lib/audit";

function makeContext(overrides: Partial<SensitiveActionContext> = {}): SensitiveActionContext {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    roleName: "Admin",
    ...overrides,
  };
}

describe("SENSITIVE_ACTIONS registry", () => {
  it("defines all required action types", () => {
    const types = SENSITIVE_ACTIONS.map((a) => a.actionType);
    expect(types).toContain("payment_apply");
    expect(types).toContain("bulk_delete");
    expect(types).toContain("cross_tenant_access");
    expect(types).toContain("gate_override");
  });

  it("critical actions have requiresReauth=true", () => {
    const criticalActions = SENSITIVE_ACTIONS.filter((a) => a.riskLevel === "critical");
    expect(criticalActions.length).toBeGreaterThan(0);
    criticalActions.forEach((a) => {
      expect(a.requiresReauth).toBe(true);
    });
  });

  it("all entries have requiresAudit=true for high+ risk", () => {
    const highRisk = SENSITIVE_ACTIONS.filter(
      (a) => a.riskLevel === "high" || a.riskLevel === "critical"
    );
    highRisk.forEach((a) => expect(a.requiresAudit).toBe(true));
  });
});

describe("getSensitiveAction", () => {
  it("returns entry for known action", () => {
    const entry = getSensitiveAction("payment_apply");
    expect(entry).toBeDefined();
    expect(entry!.actionType).toBe("payment_apply");
    expect(entry!.riskLevel).toBe("high");
  });

  it("returns undefined for unknown action", () => {
    expect(getSensitiveAction("unknown_action" as SensitiveActionType)).toBeUndefined();
  });
});

describe("requireTenantIsolation", () => {
  it("does not throw when tenants match", () => {
    expect(() => requireTenantIsolation("t1", "t1")).not.toThrow();
  });

  it("throws on tenant mismatch", () => {
    expect(() => requireTenantIsolation("t1", "t2")).toThrow(/Tenant isolation/);
  });
});

describe("checkSensitiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows action for permitted role", async () => {
    const result = await checkSensitiveAction("payment_apply", makeContext({ roleName: "Advisor" }));
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe("high");
  });

  it("denies action with tenant isolation violation", async () => {
    const result = await checkSensitiveAction(
      "payment_apply",
      makeContext({ tenantId: "tenant-1", entityTenantId: "tenant-2" })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Tenant isolation/);
    expect(result.riskLevel).toBe("critical");
    expect(logAudit).toHaveBeenCalled();
  });

  it("denies action when role is not in allowedRoles", async () => {
    const result = await checkSensitiveAction(
      "bulk_delete",
      makeContext({ roleName: "Advisor" })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed/);
  });

  it("allows bulk_delete for Admin", async () => {
    const result = await checkSensitiveAction("bulk_delete", makeContext({ roleName: "Admin" }));
    expect(result.allowed).toBe(true);
    expect(result.requiresReauth).toBe(true);
  });

  it("returns allowed=true for unknown action", async () => {
    const result = await checkSensitiveAction(
      "unknown_action" as SensitiveActionType,
      makeContext()
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresReauth).toBe(false);
  });

  it("logs permission_denied on role mismatch", async () => {
    await checkSensitiveAction("bulk_delete", makeContext({ roleName: "Viewer" }));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.stringContaining("permission_denied") })
    );
  });
});

describe("getSensitiveActionsForRole", () => {
  it("returns all actions for Admin", () => {
    const adminActions = getSensitiveActionsForRole("Admin");
    expect(adminActions.length).toBe(SENSITIVE_ACTIONS.length);
  });

  it("returns limited actions for Viewer", () => {
    const viewerActions = getSensitiveActionsForRole("Viewer");
    const viewerNames = viewerActions.map((a) => a.actionType);
    expect(viewerNames).not.toContain("bulk_delete");
    expect(viewerNames).not.toContain("feature_rollout");
  });
});

describe("isHighRiskAction", () => {
  it("returns true for high risk", () => {
    expect(isHighRiskAction("payment_apply")).toBe(true);
  });

  it("returns true for critical risk", () => {
    expect(isHighRiskAction("bulk_delete")).toBe(true);
  });

  it("returns false for unknown action", () => {
    expect(isHighRiskAction("unknown_action" as SensitiveActionType)).toBe(false);
  });
});
