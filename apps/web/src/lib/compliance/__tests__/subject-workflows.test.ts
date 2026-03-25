import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSubjectRequest,
  getSubjectRequest,
  listSubjectRequests,
  processExportRequest,
  processDeleteRequest,
  cancelSubjectRequest,
  type SubjectRequestType,
} from "../subject-workflows";

vi.mock("db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  exports: {
    $inferSelect: {},
    id: "id",
    tenantId: "tenant_id",
    contactId: "contact_id",
    type: "type",
    requestedBy: "requested_by",
    status: "status",
    createdAt: "created_at",
    completedAt: "completed_at",
  },
  exportArtifacts: {
    exportId: "export_id",
    kind: "kind",
    storagePath: "storage_path",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));
import { db } from "db";

const now = new Date();
const SAMPLE_REQUEST = {
  id: "req-1",
  tenantId: "tenant-1",
  contactId: "contact-1",
  type: "gdpr_export",
  requestedBy: "admin-1",
  status: "pending",
  createdAt: now,
  completedAt: null,
};

function mockSelect(row: typeof SAMPLE_REQUEST | null, many?: typeof SAMPLE_REQUEST[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(many ?? (row ? [row] : [])),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockInsert(row: typeof SAMPLE_REQUEST) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
}

function mockUpdate(row?: typeof SAMPLE_REQUEST) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(row ? [row] : []),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

describe("createSubjectRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert(SAMPLE_REQUEST);
  });

  it("creates request with pending status", async () => {
    const result = await createSubjectRequest({
      tenantId: "tenant-1",
      contactId: "contact-1",
      requestType: "gdpr_export",
      requestedBy: "admin-1",
    });
    expect(result.id).toBe("req-1");
    expect(result.status).toBe("pending");
    expect(result.type).toBe("gdpr_export");
  });
});

describe("getSubjectRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapped row", async () => {
    mockSelect(SAMPLE_REQUEST);
    const req = await getSubjectRequest("tenant-1", "req-1");
    expect(req).not.toBeNull();
    expect(req!.contactId).toBe("contact-1");
  });

  it("returns null when not found", async () => {
    mockSelect(null);
    const req = await getSubjectRequest("tenant-1", "nonexistent");
    expect(req).toBeNull();
  });
});

describe("listSubjectRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rows = [
      SAMPLE_REQUEST,
      { ...SAMPLE_REQUEST, id: "req-2", contactId: "contact-2", type: "gdpr_delete" },
    ];
    mockSelect(null, rows);
  });

  it("returns all requests", async () => {
    const list = await listSubjectRequests("tenant-1");
    expect(list).toHaveLength(2);
  });

  it("filters by contactId", async () => {
    const filtered = [SAMPLE_REQUEST];
    const chain = mockSelect(null, filtered);
    const list = await listSubjectRequests("tenant-1", { contactId: "contact-1" });
    expect(list.every((r) => r.contactId === "contact-1")).toBe(true);
    expect(chain.where).toHaveBeenCalled();
  });

  it("filters by type", async () => {
    const filtered = [{ ...SAMPLE_REQUEST, id: "req-2", contactId: "contact-2", type: "gdpr_delete" }];
    const chain = mockSelect(null, filtered);
    const list = await listSubjectRequests("tenant-1", { type: "gdpr_delete" });
    expect(list.every((r) => r.type === "gdpr_delete")).toBe(true);
    expect(chain.where).toHaveBeenCalled();
  });
});

describe("processExportRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes export and returns result with entity list", async () => {
    mockSelect(SAMPLE_REQUEST);
    mockInsert({ ...SAMPLE_REQUEST }); // for export_artifacts
    mockUpdate({ ...SAMPLE_REQUEST, status: "completed" });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    });

    const result = await processExportRequest("tenant-1", "req-1");
    expect(result.requestId).toBe("req-1");
    expect(result.exportedEntities).toContain("contact");
    expect(result.artifactPath).toContain("req-1");
  });

  it("throws when request not found", async () => {
    mockSelect(null);
    await expect(processExportRequest("tenant-1", "nonexistent")).rejects.toThrow(/not found/);
  });

  it("throws on tenant mismatch", async () => {
    mockSelect({ ...SAMPLE_REQUEST, tenantId: "other-tenant" });
    await expect(processExportRequest("tenant-1", "req-1")).rejects.toThrow(/isolation/);
  });
});

describe("processDeleteRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processes delete and returns categorized types", async () => {
    mockSelect({ ...SAMPLE_REQUEST, type: "gdpr_delete" });
    mockUpdate();

    const result = await processDeleteRequest("tenant-1", "req-1");
    expect(result.requestId).toBe("req-1");
    expect(result.deletedEntityTypes).toContain("documents");
    expect(result.retainedEntityTypes).toContain("financial_payment_records");
  });

  it("throws when no contactId", async () => {
    mockSelect({ ...SAMPLE_REQUEST, contactId: null as any });
    mockUpdate();
    await expect(processDeleteRequest("tenant-1", "req-1")).rejects.toThrow(/contactId/);
  });
});

describe("cancelSubjectRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels pending request", async () => {
    mockSelect(SAMPLE_REQUEST);
    mockUpdate({ ...SAMPLE_REQUEST, status: "cancelled" });

    const result = await cancelSubjectRequest("tenant-1", "req-1");
    expect(result.status).toBe("cancelled");
  });

  it("throws when trying to cancel completed request", async () => {
    mockSelect({ ...SAMPLE_REQUEST, status: "completed" });
    await expect(cancelSubjectRequest("tenant-1", "req-1")).rejects.toThrow(/Cannot cancel/);
  });
});
