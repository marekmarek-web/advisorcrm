import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  logSecurityEvent,
  getSecurityEvents,
  getSecuritySummary,
  getDefaultSeverity,
  type SecurityEventType,
  type SecuritySeverity,
} from "../security-audit";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("db", () => ({
  db: { select: vi.fn() },
  auditLog: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
  gte: vi.fn((a: unknown, b: unknown) => ({ gte: [a, b] })),
}));
vi.mock("drizzle-orm", () => ({
  like: vi.fn((a: unknown, b: unknown) => ({ like: [a, b] })),
}));

import { logAudit } from "@/lib/audit";
import { db } from "db";

const SAMPLE_ROWS = [
  {
    id: "ev-1",
    tenantId: "tenant-1",
    userId: "user-1",
    action: "security:auth_failure",
    entityType: null,
    entityId: null,
    meta: { severity: "warning", eventType: "auth_failure" },
    createdAt: new Date("2024-06-01T10:00:00Z"),
  },
  {
    id: "ev-2",
    tenantId: "tenant-1",
    userId: "user-2",
    action: "security:cross_tenant_attempt",
    entityType: "document",
    entityId: "doc-1",
    meta: { severity: "critical", eventType: "cross_tenant_attempt" },
    createdAt: new Date("2024-06-01T11:00:00Z"),
  },
];

function mockDbChain(rows: typeof SAMPLE_ROWS) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

describe("getDefaultSeverity", () => {
  it("returns correct default for auth_failure", () => {
    expect(getDefaultSeverity("auth_failure")).toBe("warning");
  });

  it("returns critical for cross_tenant_attempt", () => {
    expect(getDefaultSeverity("cross_tenant_attempt")).toBe("critical");
  });

  it("returns info for auth_success", () => {
    expect(getDefaultSeverity("auth_success")).toBe("info");
  });
});

describe("logSecurityEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls logAudit with security: prefix", async () => {
    await logSecurityEvent({
      tenantId: "tenant-1",
      userId: "user-1",
      eventType: "auth_failure",
      severity: "warning",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "security:auth_failure" })
    );
  });

  it("includes correlationId in meta", async () => {
    await logSecurityEvent({
      tenantId: "tenant-1",
      userId: "user-1",
      eventType: "permission_denied",
      severity: "warning",
      correlationId: "corr-abc",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ correlationId: "corr-abc" }),
      })
    );
  });

  it("accepts event without userId", async () => {
    await logSecurityEvent({
      tenantId: "tenant-1",
      eventType: "cron_auth_failure",
      severity: "critical",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null })
    );
  });
});

describe("getSecurityEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbChain(SAMPLE_ROWS);
  });

  it("returns mapped event rows", async () => {
    const events = await getSecurityEvents("tenant-1");
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe("auth_failure");
    expect(events[1].severity).toBe("critical");
  });

  it("returns entityId as string", async () => {
    const events = await getSecurityEvents("tenant-1");
    expect(events[1].documentId ?? events[1].entityId).toBeDefined();
  });
});

describe("getSecuritySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbChain(SAMPLE_ROWS);
  });

  it("aggregates totals correctly", async () => {
    const summary = await getSecuritySummary("tenant-1");
    expect(summary.totalEvents).toBe(2);
    expect(summary.bySeverity.warning).toBe(1);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.uniqueUserIds).toBe(2);
  });

  it("includes critical events in criticalEvents list", async () => {
    const summary = await getSecuritySummary("tenant-1");
    expect(summary.criticalEvents.some((e) => e.severity === "critical")).toBe(true);
  });

  it("builds byEventType map", async () => {
    const summary = await getSecuritySummary("tenant-1");
    expect(summary.byEventType["auth_failure"]).toBe(1);
    expect(summary.byEventType["cross_tenant_attempt"]).toBe(1);
  });
});
