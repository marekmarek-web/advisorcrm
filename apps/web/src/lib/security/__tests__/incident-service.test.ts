import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createIncident,
  getIncident,
  updateIncidentStatus,
  resolveIncident,
  listIncidents,
  isValidTransition,
  type IncidentStatus,
  type IncidentSeverity,
} from "../incident-service";

vi.mock("db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  incidentLogs: {
    $inferSelect: {},
    id: "id",
    tenantId: "tenant_id",
    title: "title",
    description: "description",
    severity: "severity",
    status: "status",
    reportedBy: "reported_by",
    reportedAt: "reported_at",
    resolvedAt: "resolved_at",
    meta: "meta",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));
import { db } from "db";

const now = new Date();
const SAMPLE_ROW = {
  id: "inc-1",
  tenantId: "tenant-1",
  title: "Test Incident",
  description: "Test description",
  severity: "high",
  status: "open",
  reportedBy: "user-1",
  reportedAt: now,
  resolvedAt: null,
  meta: {},
  createdAt: now,
  updatedAt: now,
};

function mockDbSelect(row: typeof SAMPLE_ROW | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(row ? [row] : []),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockDbInsert(row: typeof SAMPLE_ROW) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockDbUpdate(row: typeof SAMPLE_ROW) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

describe("isValidTransition", () => {
  it("open -> investigating is valid", () => {
    expect(isValidTransition("open", "investigating")).toBe(true);
  });

  it("open -> resolved is valid", () => {
    expect(isValidTransition("open", "resolved")).toBe(true);
  });

  it("closed -> open is invalid", () => {
    expect(isValidTransition("closed", "open")).toBe(false);
  });

  it("resolved -> closed is valid", () => {
    expect(isValidTransition("resolved", "closed")).toBe(true);
  });

  it("closed -> investigating is invalid", () => {
    expect(isValidTransition("closed", "investigating")).toBe(false);
  });
});

describe("createIncident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert(SAMPLE_ROW);
  });

  it("creates incident with defaults", async () => {
    const result = await createIncident({
      tenantId: "tenant-1",
      title: "Test Incident",
      severity: "high",
      reportedBy: "user-1",
    });
    expect(result.id).toBe("inc-1");
    expect(result.status).toBe("open");
    expect(result.severity).toBe("high");
  });
});

describe("getIncident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect(SAMPLE_ROW);
  });

  it("returns mapped row", async () => {
    const incident = await getIncident("tenant-1", "inc-1");
    expect(incident).not.toBeNull();
    expect(incident!.title).toBe("Test Incident");
    expect(incident!.reportedAt).toContain("T");
  });

  it("returns null when not found", async () => {
    mockDbSelect(null);
    const incident = await getIncident("tenant-1", "nonexistent");
    expect(incident).toBeNull();
  });
});

describe("updateIncidentStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates to valid status", async () => {
    mockDbSelect(SAMPLE_ROW);
    mockDbUpdate({ ...SAMPLE_ROW, status: "investigating" });

    const result = await updateIncidentStatus("tenant-1", "inc-1", "investigating");
    expect(result.status).toBe("investigating");
  });

  it("throws on invalid transition", async () => {
    mockDbSelect({ ...SAMPLE_ROW, status: "closed" });
    await expect(
      updateIncidentStatus("tenant-1", "inc-1", "open")
    ).rejects.toThrow(/Invalid status transition/);
  });

  it("throws when incident not found", async () => {
    mockDbSelect(null);
    await expect(
      updateIncidentStatus("tenant-1", "nonexistent", "investigating")
    ).rejects.toThrow(/not found/);
  });
});

describe("resolveIncident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves open incident", async () => {
    mockDbSelect(SAMPLE_ROW);
    mockDbUpdate({ ...SAMPLE_ROW, status: "resolved", resolvedAt: new Date() });

    const result = await resolveIncident("tenant-1", "inc-1", "Fixed the issue");
    expect(result.status).toBe("resolved");
  });

  it("throws when already closed", async () => {
    mockDbSelect({ ...SAMPLE_ROW, status: "closed" });
    await expect(resolveIncident("tenant-1", "inc-1")).rejects.toThrow(/Cannot resolve/);
  });
});

describe("listIncidents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([SAMPLE_ROW, { ...SAMPLE_ROW, id: "inc-2", severity: "low" }]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  });

  it("returns all incidents", async () => {
    const incidents = await listIncidents("tenant-1");
    expect(incidents).toHaveLength(2);
  });

  it("filters by severity", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([SAMPLE_ROW]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const incidents = await listIncidents("tenant-1", { severity: "high" });
    expect(incidents.every((i) => i.severity === "high")).toBe(true);
    expect(chain.where).toHaveBeenCalled();
  });

  it("filters by status array", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([SAMPLE_ROW]),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const incidents = await listIncidents("tenant-1", { status: ["open"] });
    expect(incidents.every((i) => i.status === "open")).toBe(true);
    expect(chain.where).toHaveBeenCalled();
  });
});
