import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkDocumentAccess,
  logDocumentAccess,
  getDocumentAccessHistory,
  type DocumentAccessCheck,
  type DocumentAccessPurpose,
} from "../document-access";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("db", () => ({
  db: { select: vi.fn() },
  auditLog: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));
vi.mock("drizzle-orm", () => ({
  like: vi.fn((a: unknown, b: unknown) => ({ like: [a, b] })),
}));

import { logAudit } from "@/lib/audit";
import { db } from "db";

function makeCheck(overrides: Partial<DocumentAccessCheck> = {}): DocumentAccessCheck {
  return {
    documentId: "doc-1",
    tenantId: "tenant-1",
    userId: "user-1",
    roleName: "Advisor",
    purpose: "preview",
    documentTenantId: "tenant-1",
    isSensitive: false,
    visibleToClient: false,
    ...overrides,
  };
}

describe("checkDocumentAccess", () => {
  it("allows preview for Advisor in same tenant", () => {
    const result = checkDocumentAccess(makeCheck());
    expect(result.allowed).toBe(true);
  });

  it("denies when document is from a different tenant", () => {
    const result = checkDocumentAccess(makeCheck({ documentTenantId: "tenant-other" }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Tenant isolation/);
    expect(result.requiresAudit).toBe(true);
  });

  it("allows Client to preview visible documents", () => {
    const result = checkDocumentAccess(
      makeCheck({ roleName: "Client", purpose: "preview", visibleToClient: true })
    );
    expect(result.allowed).toBe(true);
  });

  it("denies Client when document is not visible to client", () => {
    const result = checkDocumentAccess(
      makeCheck({ roleName: "Client", visibleToClient: false })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not visible/);
  });

  it("denies Client from a different contact", () => {
    const result = checkDocumentAccess(
      makeCheck({
        roleName: "Client",
        visibleToClient: true,
        contactId: "contact-1",
        documentContactId: "contact-2",
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/different client/);
  });

  it("denies Client from exporting", () => {
    const result = checkDocumentAccess(
      makeCheck({ roleName: "Client", purpose: "export", visibleToClient: true })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cannot export/);
  });

  it("denies Advisor from exporting sensitive documents", () => {
    const result = checkDocumentAccess(
      makeCheck({ roleName: "Advisor", purpose: "export", isSensitive: true })
    );
    expect(result.allowed).toBe(false);
    // Advisor cannot export at all (role-based check fires first)
    expect(result.reason).toMatch(/cannot export/);
  });

  it("allows Manager to export sensitive documents", () => {
    const result = checkDocumentAccess(
      makeCheck({ roleName: "Manager", purpose: "export", isSensitive: true })
    );
    expect(result.allowed).toBe(true);
  });

  it("requiresAudit=true for downloads", () => {
    const result = checkDocumentAccess(makeCheck({ purpose: "download" }));
    expect(result.allowed).toBe(true);
    expect(result.requiresAudit).toBe(true);
  });

  it("denies Viewer from downloading", () => {
    const result = checkDocumentAccess(makeCheck({ roleName: "Viewer", purpose: "download" }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cannot download/);
  });
});

describe("logDocumentAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls logAudit with correct action", async () => {
    await logDocumentAccess(makeCheck({ purpose: "download" }));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document:access:download" })
    );
  });
});

describe("getDocumentAccessHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "log-1",
          tenantId: "tenant-1",
          userId: "user-1",
          action: "document:access:download",
          entityId: "doc-1",
          meta: { purpose: "download" },
          createdAt: new Date("2024-01-01"),
        },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);
  });

  it("returns formatted history entries", async () => {
    const history = await getDocumentAccessHistory("tenant-1", "doc-1");
    expect(history).toHaveLength(1);
    expect(history[0].purpose).toBe("download");
    expect(history[0].documentId).toBe("doc-1");
  });
});
