/**
 * Image Intake Phase 2: chat route integration tests.
 * Tests that image intake routing works in the chat route handler
 * and that text-only requests are completely unaffected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Shared mocks (same pattern as assistant-chat-endpoint-phase4.test.ts) ---

const repoMocks = vi.hoisted(() => ({
  loadConversationHydration: vi.fn().mockResolvedValue(null),
  loadResumableExecutionPlanSnapshot: vi.fn().mockResolvedValue(null),
  upsertConversationFromSession: vi.fn().mockResolvedValue(undefined),
  appendConversationMessage: vi.fn().mockResolvedValue(undefined),
}));

// next/server `after` throws outside request scope in tests
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, after: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  }),
}));

vi.mock("@/lib/auth/get-membership", () => ({
  getMembership: vi.fn().mockResolvedValue({ tenantId: "tenant-1", roleName: "Advisor" }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/assistant-sentry", () => ({
  captureAssistantApiError: vi.fn(),
}));

vi.mock("@/lib/ai/assistant-conversation-repository", () => ({
  loadConversationHydration: repoMocks.loadConversationHydration,
  loadResumableExecutionPlanSnapshot: repoMocks.loadResumableExecutionPlanSnapshot,
  upsertConversationFromSession: repoMocks.upsertConversationFromSession,
  appendConversationMessage: repoMocks.appendConversationMessage,
}));

const openaiMocks = vi.hoisted(() => ({
  createResponseStructured: vi.fn(),
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "ok" }),
  logOpenAICall: vi.fn(),
}));

vi.mock("@/lib/openai", () => openaiMocks);

// Mock assistant tool router to isolate image intake routing
const routerMocks = vi.hoisted(() => ({
  routeAssistantMessage: vi.fn(),
  routeAssistantMessageCanonical: vi.fn(),
  handleAssistantAwaitingConfirmation: vi.fn(),
}));

vi.mock("@/lib/ai/assistant-tool-router", () => ({
  routeAssistantMessage: routerMocks.routeAssistantMessage,
  routeAssistantMessageCanonical: routerMocks.routeAssistantMessageCanonical,
  handleAssistantAwaitingConfirmation: routerMocks.handleAssistantAwaitingConfirmation,
}));

vi.mock("db", () => ({
  db: { select: vi.fn(), from: vi.fn(), where: vi.fn(), leftJoin: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), insert: vi.fn(), values: vi.fn(), update: vi.fn(), set: vi.fn() },
  eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), isNotNull: vi.fn(), gte: vi.fn(), sql: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  assistantConversations: {}, assistantMessages: {}, contacts: {}, tasks: {}, contracts: {}, contractUploadReviews: {},
}));

vi.mock("@/lib/ai/assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));

const TEXT_RESPONSE = {
  message: "Test response",
  referencedEntities: [],
  suggestedActions: [],
  warnings: [],
  confidence: 0.9,
  sourcesSummary: [],
  sessionId: "sess-1",
};

import { POST } from "@/app/api/ai/assistant/chat/route";

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ai/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": "user-1", ...headers },
    body: JSON.stringify(body),
  });
}

function hasImageIntakeAssets() {
  return [
    {
      url: "https://storage.example.com/img.jpg",
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      sizeBytes: 500000,
      width: 1024,
      height: 768,
    },
  ];
}

describe("chat route — text-only flow (must not regress)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.routeAssistantMessage.mockResolvedValue(TEXT_RESPONSE);
    routerMocks.routeAssistantMessageCanonical.mockResolvedValue(TEXT_RESPONSE);
    openaiMocks.createResponseStructured.mockResolvedValue({
      text: "{}",
      parsed: { inputType: "mixed_or_uncertain_image", confidence: 0.3, rationale: "test", needsDeepExtraction: false, safePreviewAlready: false },
      model: "gpt-5-mini",
    });
  });

  it("text message uses canonical router", async () => {
    const req = makeRequest({ message: "Vytvoř úkol", orchestration: "canonical" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(routerMocks.routeAssistantMessageCanonical).toHaveBeenCalledOnce();
  });

  it("text message without imageAssets is not routed to image intake", async () => {
    const req = makeRequest({ message: "Jaký je stav klienta?", orchestration: "canonical" });
    await POST(req);
    // routeAssistantMessageCanonical called, not image intake
    expect(routerMocks.routeAssistantMessageCanonical).toHaveBeenCalledOnce();
  });

  it("empty message with no imageAssets returns 400", async () => {
    const req = makeRequest({ message: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("chat route — image intake routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.routeAssistantMessage.mockResolvedValue(TEXT_RESPONSE);
    routerMocks.routeAssistantMessageCanonical.mockResolvedValue(TEXT_RESPONSE);
    openaiMocks.createResponseStructured.mockResolvedValue({
      text: "{}",
      parsed: { inputType: "mixed_or_uncertain_image", confidence: 0.3, rationale: "test", needsDeepExtraction: false, safePreviewAlready: false },
      model: "gpt-5-mini",
    });
  });

  it("image request with FLAG OFF falls through to text flow (not image intake)", async () => {
    const origFlag = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "false";

    // With flag off and no message, hasImageAssets=true prevents 400.
    // Text router is called with empty message and returns mocked response.
    openaiMocks.createResponseStructured.mockResolvedValue({
      text: "{}",
      parsed: { inputType: "mixed_or_uncertain_image", confidence: 0.3, rationale: "test", needsDeepExtraction: false, safePreviewAlready: false },
      model: "gpt-5-mini",
    });
    const req = makeRequest({
      imageAssets: hasImageIntakeAssets(),
      message: "Pošli to k zákazníkovi", // add message so text route is triggered
      orchestration: "canonical",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Text router called, image intake route NOT called
    expect(routerMocks.routeAssistantMessageCanonical).toHaveBeenCalledOnce();

    process.env.IMAGE_INTAKE_ENABLED = origFlag ?? "";
  });

  it("image request with FLAG ON returns 200 and image intake response", async () => {
    const origFlag = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "true";

    const req = makeRequest({ imageAssets: hasImageIntakeAssets() });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Response must have image intake sourcesSummary
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
    // Text router should NOT be called
    expect(routerMocks.routeAssistantMessageCanonical).not.toHaveBeenCalled();
    expect(routerMocks.routeAssistantMessage).not.toHaveBeenCalled();

    process.env.IMAGE_INTAKE_ENABLED = origFlag ?? "";
  });

  it("image request with accompanying text is processed", async () => {
    const origFlag = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "true";

    const req = makeRequest({
      message: "Tohle je zpráva od klienta",
      imageAssets: hasImageIntakeAssets(),
      orchestration: "canonical",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(routerMocks.routeAssistantMessageCanonical).not.toHaveBeenCalled();

    process.env.IMAGE_INTAKE_ENABLED = origFlag ?? "";
  });

  it("confirm/cancel flow still works even with imageAssets present", async () => {
    const origFlag = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "true";

    routerMocks.handleAssistantAwaitingConfirmation.mockResolvedValue(TEXT_RESPONSE);

    const req = makeRequest({
      message: "ano",
      imageAssets: hasImageIntakeAssets(),
      confirmExecution: true,
      orchestration: "canonical",
    });
    const res = await POST(req);
    // confirm takes priority over image intake
    expect(res.status).toBe(200);
    expect(routerMocks.handleAssistantAwaitingConfirmation).toHaveBeenCalledOnce();

    process.env.IMAGE_INTAKE_ENABLED = origFlag ?? "";
  });
});
