import { describe, it, expect, vi } from "vitest";

const chainable = () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockImplementation(self);
  chain.from = vi.fn().mockImplementation(self);
  chain.where = vi.fn().mockImplementation(self);
  chain.leftJoin = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue({ rows: [] });
  chain.insert = vi.fn().mockImplementation(self);
  chain.values = vi.fn().mockImplementation(self);
  return chain;
};
vi.mock("db", () => ({
  db: chainable(),
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), sql: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  tasks: { contactId: "contactId", id: "id", tenantId: "tenantId", completedAt: "completedAt", dueDate: "dueDate", title: "title" },
  contacts: { id: "id", tenantId: "tenantId", firstName: "firstName", lastName: "lastName", nextServiceDue: "nextServiceDue", email: "email", phone: "phone" },
  contracts: {}, opportunities: { id: "id", tenantId: "tenantId", title: "title", expectedCloseDate: "expectedCloseDate", contactId: "contactId", closedAt: "closedAt" },
  opportunityStages: {},
  contractUploadReviews: { id: "id", tenantId: "tenantId", fileName: "fileName", processingStatus: "processingStatus", confidence: "confidence", createdAt: "createdAt", reviewStatus: "reviewStatus", extractionTrace: "extractionTrace", extractedPayload: "extractedPayload", detectedDocumentType: "detectedDocumentType", matchedClientId: "matchedClientId", matchedClientCandidates: "matchedClientCandidates" },
  clientPaymentSetups: { id: "id", tenantId: "tenantId", needsHumanReview: "needsHumanReview", productName: "productName", providerName: "providerName" },
  contractReviewCorrections: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseSafe: vi.fn() }));
vi.mock("@/lib/client-ai-context", () => ({
  getClientAiContext: vi.fn().mockResolvedValue(null),
}));

const { ASSISTANT_TOOLS, getToolByName, getToolDescriptions } = await import(
  "../assistant-tools"
);

describe("ASSISTANT_TOOLS", () => {
  it("defines at least 9 tools", () => {
    expect(ASSISTANT_TOOLS.length).toBeGreaterThanOrEqual(9);
  });

  it("each tool has required fields", () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("draft tools require permission", () => {
    const taskTool = getToolByName("createTaskDraft");
    expect(taskTool?.requiredPermission).toBe("assistant:create_draft");
    const emailTool = getToolByName("createEmailDraft");
    expect(emailTool?.requiredPermission).toBe("assistant:create_draft");
  });
});

describe("getToolByName", () => {
  it("returns tool for valid name", () => {
    expect(getToolByName("getDashboardSummary")).toBeDefined();
  });
  it("returns undefined for unknown name", () => {
    expect(getToolByName("nonexistent")).toBeUndefined();
  });
});

describe("getToolDescriptions", () => {
  it("returns array with name and description", () => {
    const descs = getToolDescriptions();
    expect(descs.length).toBeGreaterThan(0);
    expect(descs[0].name).toBeTruthy();
    expect(descs[0].description).toBeTruthy();
  });
});

describe("tool handlers", () => {
  const ctx = { tenantId: "t1", userId: "u1", roleName: "Advisor" };

  it("getDashboardSummary returns data", async () => {
    const tool = getToolByName("getDashboardSummary")!;
    const result = await tool.handler({}, ctx);
    expect(result.data).toBeDefined();
    expect(result.sourceReferences).toBeDefined();
  });

  it("getClientSummary requires contactId", async () => {
    const tool = getToolByName("getClientSummary")!;
    const result = await tool.handler({}, ctx);
    expect(result.data.error).toBe("contactId required");
  });

  it("createTaskDraft returns draft", async () => {
    const tool = getToolByName("createTaskDraft")!;
    const result = await tool.handler({ title: "Test task" }, ctx);
    expect(result.data.draft).toBeDefined();
  });
});
