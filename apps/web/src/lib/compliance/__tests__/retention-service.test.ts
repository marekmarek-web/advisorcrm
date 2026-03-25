import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRetentionPolicy,
  getEntityRetentionPolicy,
  getEffectiveRetention,
  addRetentionLock,
  removeRetentionLock,
  isRetentionLocked,
  getRetentionLock,
  canDeleteEntity,
  DEFAULT_RETENTION_POLICIES,
} from "../retention-service";

vi.mock("db", () => ({
  db: { select: vi.fn() },
  processingPurposes: { tenantId: "tenant_id", retentionMonths: "retention_months" },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}));
vi.mock("@/lib/security/data-classification", () => ({
  DATA_CLASS_DEFINITIONS: {},
  getDataClass: vi.fn((entityType: string) => {
    const map: Record<string, string> = {
      document: "document_original",
      contact: "personal_data",
      client_payment_setup: "financial_payment",
      audit_log: "audit_security",
      task: "internal_operational",
    };
    return map[entityType] ?? "internal_operational";
  }),
}));

import { db } from "db";

function mockDbSelect(rows: { retentionMonths: number | null }[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
}

// Note: we need to access DEFAULT_RETENTION_POLICIES but it's defined in the module
// re-import from the actual module:
import * as retentionModule from "../retention-service";

describe("getRetentionPolicy", () => {
  it("returns policy for personal_data", () => {
    const policy = retentionModule.getRetentionPolicy("personal_data");
    expect(policy.retentionMonths).toBe(60);
    expect(policy.allowsDeletion).toBe(true);
  });

  it("financial_payment is non-deletable", () => {
    const policy = retentionModule.getRetentionPolicy("financial_payment");
    expect(policy.allowsDeletion).toBe(false);
    expect(policy.retentionMonths).toBe(120);
  });

  it("audit_security is non-deletable", () => {
    const policy = retentionModule.getRetentionPolicy("audit_security");
    expect(policy.allowsDeletion).toBe(false);
  });
});

describe("getEntityRetentionPolicy", () => {
  it("maps document to document_original policy", () => {
    const policy = retentionModule.getEntityRetentionPolicy("document");
    expect(policy.dataClass).toBe("document_original");
  });

  it("maps client_payment_setup to financial_payment", () => {
    const policy = retentionModule.getEntityRetentionPolicy("client_payment_setup");
    expect(policy.dataClass).toBe("financial_payment");
    expect(policy.allowsDeletion).toBe(false);
  });
});

describe("getEffectiveRetention", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns default policy when no tenant override", async () => {
    mockDbSelect([]);
    const effective = await retentionModule.getEffectiveRetention("tenant-1", "contact");
    expect(effective.source).toBe("default");
    expect(effective.retentionMonths).toBe(60);
  });

  it("uses tenant override when present", async () => {
    mockDbSelect([{ retentionMonths: 84 }]);
    const effective = await retentionModule.getEffectiveRetention("tenant-1", "contact");
    expect(effective.source).toBe("tenant_override");
    expect(effective.retentionMonths).toBeGreaterThanOrEqual(60);
  });
});

describe("retention locks", () => {
  afterEach(() => {
    retentionModule.removeRetentionLock("tenant-1", "document", "doc-1");
    retentionModule.removeRetentionLock("tenant-1", "document", "doc-2");
  });

  it("adds and checks lock", () => {
    retentionModule.addRetentionLock("tenant-1", "document", "doc-1", "Legal hold", "user-admin");
    expect(retentionModule.isRetentionLocked("tenant-1", "document", "doc-1")).toBe(true);
  });

  it("returns null when no lock exists", () => {
    expect(retentionModule.getRetentionLock("tenant-1", "document", "no-doc")).toBeNull();
  });

  it("removes lock correctly", () => {
    retentionModule.addRetentionLock("tenant-1", "document", "doc-2", "Reason", "user-1");
    retentionModule.removeRetentionLock("tenant-1", "document", "doc-2");
    expect(retentionModule.isRetentionLocked("tenant-1", "document", "doc-2")).toBe(false);
  });

  it("returns lock details", () => {
    retentionModule.addRetentionLock("tenant-1", "document", "doc-1", "Investigation", "user-admin");
    const lock = retentionModule.getRetentionLock("tenant-1", "document", "doc-1");
    expect(lock?.reason).toBe("Investigation");
    expect(lock?.lockedBy).toBe("user-admin");
  });
});

describe("canDeleteEntity", () => {
  afterEach(() => {
    retentionModule.removeRetentionLock("tenant-1", "contact", "c-1");
  });

  it("allows deletion for personal_data contact", () => {
    const result = retentionModule.canDeleteEntity("tenant-1", "contact", "c-1");
    expect(result.canDelete).toBe(true);
  });

  it("denies deletion for financial_payment records", () => {
    const result = retentionModule.canDeleteEntity("tenant-1", "client_payment_setup", "ps-1");
    expect(result.canDelete).toBe(false);
    expect(result.reason).toMatch(/does not allow/);
  });

  it("denies deletion when locked", () => {
    retentionModule.addRetentionLock("tenant-1", "contact", "c-1", "Legal hold", "admin");
    const result = retentionModule.canDeleteEntity("tenant-1", "contact", "c-1");
    expect(result.canDelete).toBe(false);
    expect(result.reason).toMatch(/retention lock/);
  });
});
