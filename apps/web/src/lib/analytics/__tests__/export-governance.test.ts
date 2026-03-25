import { describe, it, expect, vi } from "vitest";
import { canExport, maskSensitiveFields, formatCsv, formatJson } from "../export-governance";
import type { ReportPayload } from "../reporting-service";

vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

describe("canExport", () => {
  it("allows Admin to export any report", () => {
    expect(canExport("Admin", "advisor_weekly")).toBe(true);
    expect(canExport("Admin", "executive_monthly")).toBe(true);
    expect(canExport("Admin", "pipeline_quality")).toBe(true);
  });

  it("allows Director to export executive reports", () => {
    expect(canExport("Director", "executive_monthly")).toBe(true);
    expect(canExport("Director", "pipeline_quality")).toBe(true);
  });

  it("restricts Advisor to advisor_weekly only", () => {
    expect(canExport("Advisor", "advisor_weekly")).toBe(true);
    expect(canExport("Advisor", "executive_monthly")).toBe(false);
    expect(canExport("Advisor", "manager_team")).toBe(false);
  });

  it("blocks Viewer from all exports", () => {
    expect(canExport("Viewer", "advisor_weekly")).toBe(false);
    expect(canExport("Viewer", "executive_monthly")).toBe(false);
  });

  it("blocks Client from all exports", () => {
    expect(canExport("Client", "advisor_weekly")).toBe(false);
  });
});

describe("maskSensitiveFields", () => {
  it("does not mask for Admin", () => {
    const data = { email: "test@example.com", name: "Test" };
    const result = maskSensitiveFields(data, "Admin");
    expect(result.email).toBe("test@example.com");
  });

  it("does not mask for Director", () => {
    const data = { email: "test@example.com" };
    const result = maskSensitiveFields(data, "Director");
    expect(result.email).toBe("test@example.com");
  });

  it("masks PII fields for Manager", () => {
    const data = { email: "test@example.com", phone: "123456", name: "Test" };
    const result = maskSensitiveFields(data, "Manager");
    expect(result.email).toBe("***");
    expect(result.phone).toBe("***");
    expect(result.name).toBe("Test");
  });

  it("masks nested PII fields", () => {
    const data = { contact: { email: "x@y.com", name: "Foo" } };
    const result = maskSensitiveFields(data, "Advisor");
    const contact = result.contact as Record<string, unknown>;
    expect(contact.email).toBe("***");
    expect(contact.name).toBe("Foo");
  });
});

describe("formatCsv", () => {
  it("produces CSV output", () => {
    const payload: ReportPayload = {
      type: "advisor_weekly",
      title: "Test Report",
      generatedAt: new Date("2025-06-01"),
      scope: { tenantId: "t1", userId: "u1", scopeType: "advisor" },
      sections: [{ title: "Summary", data: { pending: 5, blocked: 2 } }],
      metadata: {},
    };
    const csv = formatCsv(payload);
    expect(csv).toContain("# Test Report");
    expect(csv).toContain("pending,blocked");
    expect(csv).toContain("5,2");
  });
});

describe("formatJson", () => {
  it("produces valid JSON", () => {
    const payload: ReportPayload = {
      type: "advisor_weekly",
      title: "Test",
      generatedAt: new Date("2025-06-01"),
      scope: { tenantId: "t1", userId: "u1", scopeType: "advisor" },
      sections: [],
      metadata: {},
    };
    const json = formatJson(payload);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("advisor_weekly");
  });
});
