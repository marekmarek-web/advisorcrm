import { describe, it, expect, vi } from "vitest";
import { deriveScopeType, resolveAnalyticsScope, isUserInScope, resolveTimeWindow, canAccessAnalytics, type AnalyticsScope } from "../analytics-scope";

vi.mock("@/lib/team-hierarchy", () => ({
  getVisibleUserIds: vi.fn().mockResolvedValue(["u1", "u2", "u3"]),
}));

describe("deriveScopeType", () => {
  it("maps Admin to admin", () => expect(deriveScopeType("Admin")).toBe("admin"));
  it("maps Director to director", () => expect(deriveScopeType("Director")).toBe("director"));
  it("maps Manager to manager", () => expect(deriveScopeType("Manager")).toBe("manager"));
  it("maps Advisor to advisor", () => expect(deriveScopeType("Advisor")).toBe("advisor"));
  it("maps Viewer to advisor", () => expect(deriveScopeType("Viewer")).toBe("advisor"));
  it("maps Client to advisor", () => expect(deriveScopeType("Client")).toBe("advisor"));
});

describe("resolveAnalyticsScope", () => {
  it("returns single-user scope for advisors", async () => {
    const scope = await resolveAnalyticsScope("t1", "u1", "Advisor");
    expect(scope.scopeType).toBe("advisor");
    expect(scope.visibleUserIds).toEqual(["u1"]);
  });

  it("returns hierarchy scope for managers", async () => {
    const scope = await resolveAnalyticsScope("t1", "u1", "Manager");
    expect(scope.scopeType).toBe("manager");
    expect(scope.visibleUserIds).toContain("u1");
  });

  it("returns hierarchy scope for directors", async () => {
    const scope = await resolveAnalyticsScope("t1", "u1", "Director");
    expect(scope.scopeType).toBe("director");
  });

  it("returns hierarchy scope for admins", async () => {
    const scope = await resolveAnalyticsScope("t1", "u1", "Admin");
    expect(scope.scopeType).toBe("admin");
  });
});

describe("isUserInScope", () => {
  const baseScope: AnalyticsScope = { tenantId: "t1", userId: "u1", roleName: "Manager", visibleUserIds: ["u1", "u2"], scopeType: "manager" };

  it("returns true for user in visibleUserIds", () => {
    expect(isUserInScope(baseScope, "u2")).toBe(true);
  });

  it("returns false for user not in visibleUserIds", () => {
    expect(isUserInScope(baseScope, "u99")).toBe(false);
  });

  it("returns true for any user when scope is admin", () => {
    expect(isUserInScope({ ...baseScope, scopeType: "admin" }, "u99")).toBe(true);
  });

  it("returns true for any user when scope is director", () => {
    expect(isUserInScope({ ...baseScope, scopeType: "director" }, "u99")).toBe(true);
  });
});

describe("resolveTimeWindow", () => {
  it("returns 7-day window by default", () => {
    const w = resolveTimeWindow();
    const diff = w.endDate.getTime() - w.startDate.getTime();
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(7);
  });

  it("accepts custom window", () => {
    const w = resolveTimeWindow(30);
    const diff = w.endDate.getTime() - w.startDate.getTime();
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(30);
  });
});

describe("canAccessAnalytics", () => {
  it("advisor level is accessible to all", () => {
    expect(canAccessAnalytics("Advisor", "advisor")).toBe(true);
    expect(canAccessAnalytics("Viewer", "advisor")).toBe(true);
  });

  it("team level requires Manager+", () => {
    expect(canAccessAnalytics("Manager", "team")).toBe(true);
    expect(canAccessAnalytics("Director", "team")).toBe(true);
    expect(canAccessAnalytics("Advisor", "team")).toBe(false);
  });

  it("executive level requires Director+", () => {
    expect(canAccessAnalytics("Director", "executive")).toBe(true);
    expect(canAccessAnalytics("Admin", "executive")).toBe(true);
    expect(canAccessAnalytics("Manager", "executive")).toBe(false);
  });

  it("pipeline level requires Director+", () => {
    expect(canAccessAnalytics("Director", "pipeline")).toBe(true);
    expect(canAccessAnalytics("Manager", "pipeline")).toBe(false);
  });
});
