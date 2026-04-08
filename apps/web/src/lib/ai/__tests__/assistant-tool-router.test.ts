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
  eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  tasks: { contactId: "c", id: "id", tenantId: "t", completedAt: "ca", dueDate: "dd", title: "ti" },
  contacts: { id: "id", tenantId: "t", firstName: "fn", lastName: "ln", nextServiceDue: "nsd", email: "e", phone: "p" },
  contracts: {}, opportunities: { id: "id", tenantId: "t", title: "ti", expectedCloseDate: "ecd", contactId: "c", closedAt: "ca" },
  opportunityStages: {},
  contractUploadReviews: { id: "id", tenantId: "t", fileName: "fn", processingStatus: "ps", confidence: "c", createdAt: "ca", reviewStatus: "rs", extractionTrace: "et", extractedPayload: "ep", detectedDocumentType: "dt", matchedClientId: "mc", matchedClientCandidates: "mcc" },
  clientPaymentSetups: { id: "id", tenantId: "t", needsHumanReview: "nhr", productName: "pn", providerName: "pvn" },
  contractReviewCorrections: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "Dobrý den, máte 0 urgentních položek." }),
  createResponseStructuredWithImage: vi.fn().mockResolvedValue({
    parsed: { reply: "Na obrázku vidím kontaktní údaje klienta." },
  }),
  createResponseStructuredWithImages: vi.fn().mockResolvedValue({
    parsed: { reply: "Na obrázcích vidím kontaktní údaje klienta." },
  }),
  logOpenAICall: vi.fn(),
}));
vi.mock("@/lib/client-ai-context", () => ({
  getClientAiContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("../assistant-intent-extract", () => ({
  extractAssistantIntent: vi.fn().mockResolvedValue({
    actions: ["general_chat"],
    switchClient: false,
    clientRef: null,
    amount: null,
    ltv: null,
    purpose: null,
    bank: null,
    rateGuess: null,
    noEmail: false,
    dueDateText: null,
  }),
  extractCanonicalIntent: vi.fn().mockResolvedValue({
    intentType: "general_chat",
    subIntent: null,
    productDomain: null,
    targetClient: null,
    targetOpportunity: null,
    targetDocument: null,
    requestedActions: ["general_chat"],
    extractedFacts: [],
    missingFields: [],
    temporalExpressions: [],
    confidence: 0.5,
    requiresConfirmation: false,
    switchClient: false,
    noEmail: false,
    userConstraints: [],
  }),
}));
vi.mock("../assistant-crm-writes", () => ({
  executeMortgageDealAndFollowUpTask: vi.fn(),
}));



const { parseModelToolCalls, formatToolResultForModel, routeAssistantMessage, routeAssistantMessageCanonical } = await import(
  "../assistant-tool-router"
);
const { getOrCreateSession } = await import("../assistant-session");
const { extractCanonicalIntent } = await import("../assistant-intent-extract");
const entityResolution = await import("../assistant-entity-resolution");
const openai = await import("@/lib/openai");

describe("parseModelToolCalls", () => {
  it("extracts tool calls from text", () => {
    const text = 'Podívám se [TOOL:getDashboardSummary] na vaše data.';
    const calls = parseModelToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("getDashboardSummary");
  });

  it("extracts tool calls with params", () => {
    const text = '[TOOL:getClientSummary {"contactId": "abc-123"}]';
    const calls = parseModelToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("getClientSummary");
    expect(calls[0].params.contactId).toBe("abc-123");
  });

  it("returns empty for no tools", () => {
    expect(parseModelToolCalls("Normální odpověď.")).toEqual([]);
  });
});

describe("formatToolResultForModel", () => {
  it("formats result with data", () => {
    const formatted = formatToolResultForModel("getDashboardSummary", {
      data: { count: 5 },
      sourceReferences: [],
      warnings: [],
    });
    expect(formatted).toContain("[RESULT:getDashboardSummary]");
    expect(formatted).toContain('"count": 5');
  });

  it("includes warnings", () => {
    const formatted = formatToolResultForModel("test", {
      data: {},
      sourceReferences: [],
      warnings: ["pozor!"],
    });
    expect(formatted).toContain("pozor!");
  });
});

describe("routeAssistantMessage", () => {
  it("returns structured response", async () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    const response = await routeAssistantMessage("Co mám dělat?", session);
    expect(response.message).toBeTruthy();
    expect(response.sessionId).toBeTruthy();
    expect(response.confidence).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.warnings)).toBe(true);
    expect(Array.isArray(response.referencedEntities)).toBe(true);
  });

  it("increments message count", async () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    expect(session.messageCount).toBe(0);
    await routeAssistantMessage("Test", session);
    expect(session.messageCount).toBe(1);
  });

  it("includes recent conversation lines in general chat prompt", async () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    await routeAssistantMessage("Navaz prosím na předchozí konverzaci.", session, undefined, {
      recentMessages: [
        { role: "user", content: "Klient poslal screenshot plateb.", },
        { role: "assistant", content: "Pošli mi prosím jméno klienta.", },
      ],
    });

    expect(vi.mocked(openai.createResponseSafe)).toHaveBeenCalledWith(
      expect.stringContaining("Poslední průběh konverzace:\nUživatel: Klient poslal screenshot plateb.\nAsistent: Pošli mi prosím jméno klienta."),
      expect.objectContaining({ routing: { category: "advisor_chat" } }),
    );
  });

  it("uses multimodal fallback when image assets are provided", async () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    const response = await routeAssistantMessage("Co je na obrázku?", session, undefined, {
      imageAssets: [{ url: "https://example.com/image.png", mimeType: "image/png" }],
    });

    expect(vi.mocked(openai.createResponseStructuredWithImage)).toHaveBeenCalled();
    expect(response.message).toContain("Na obrázku");
  });
});

describe("routeAssistantMessageCanonical", () => {
  it("keeps draft plan in preview when mortgage amount is missing", async () => {
    vi.mocked(extractCanonicalIntent).mockResolvedValueOnce({
      intentType: "create_opportunity",
      subIntent: null,
      productDomain: "hypo",
      targetClient: null,
      targetOpportunity: null,
      targetDocument: null,
      requestedActions: ["create_opportunity"],
      extractedFacts: [],
      missingFields: [],
      temporalExpressions: [],
      confidence: 0.92,
      requiresConfirmation: true,
      switchClient: false,
      noEmail: false,
      userConstraints: [],
    });
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce({
      client: {
        entityType: "contact",
        entityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        displayLabel: "Jan Novák",
        confidence: 1,
        ambiguous: false,
        alternatives: [],
      },
      opportunity: null,
      document: null,
      contract: null,
      warnings: [],
    });

    const session = getOrCreateSession(undefined, "t1", "u1");
    const response = await routeAssistantMessageCanonical(
      "Klient Jan Novák chce hypotéku, vytvoř obchod.",
      session,
      { clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    );

    expect(response.executionState?.status).toBe("draft");
    expect(response.message).toMatch(/chybí cílová částka/i);
    expect(response.executionState?.stepPreviews?.[0]?.preflightStatus).toBe("needs_input");
  });
});
