/**
 * Pending client resolution must run before image intake when both text and imageAssets are present.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  loadConversationHydration: vi.fn().mockResolvedValue(null),
  loadResumableExecutionPlanSnapshot: vi.fn().mockResolvedValue(null),
  upsertConversationFromSession: vi.fn().mockResolvedValue(undefined),
  appendConversationMessage: vi.fn().mockResolvedValue(undefined),
}));

const intakeMocks = vi.hoisted(() => ({
  handleImageIntakeFromChatRoute: vi.fn(),
}));

const contactSearchMock = vi.hoisted(() => ({
  searchContactsForAssistant: vi.fn(),
}));

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

vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn(),
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "ok" }),
  logOpenAICall: vi.fn(),
}));

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
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    leftJoin: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  },
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  assistantConversations: {},
  assistantMessages: {},
  contacts: {},
  tasks: {},
  contracts: {},
  contractUploadReviews: {},
}));

vi.mock("@/lib/ai/assistant-contact-search", () => ({
  searchContactsForAssistant: contactSearchMock.searchContactsForAssistant,
}));

vi.mock("@/lib/ai/image-intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/image-intake")>();
  return {
    ...actual,
    handleImageIntakeFromChatRoute: intakeMocks.handleImageIntakeFromChatRoute,
  };
});

import { POST } from "@/app/api/ai/assistant/chat/route";
import { PENDING_IMAGE_INTAKE_METADATA_KEY } from "@/lib/ai/image-intake/pending-resolution-metadata";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ai/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify(body),
  });
}

function pendingPayload(): Record<string, unknown> {
  return {
    intakeId: "img_prio_1",
    factBundle: {
      facts: [
        {
          factType: "deadline_date",
          factKey: "due",
          value: "1. 1. 2026",
          normalizedValue: null,
          confidence: 0.9,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
        },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal_pass",
    },
    actionPlan: {
      outputMode: "ambiguous_needs_input",
      recommendedActions: [],
      draftReplyText: null,
      whyThisAction: "missing client",
      whyNotOtherActions: null,
      needsAdvisorInput: true,
      safetyFlags: [],
    },
    bindingState: "insufficient_binding",
    candidates: [],
    imageNameSignal: null,
    inputType: "screenshot_client_communication",
    createdAt: new Date().toISOString(),
  };
}

const IMAGE_ASSETS = [
  {
    url: "https://storage.example.com/img.jpg",
    mimeType: "image/jpeg",
    filename: "photo.jpg",
    sizeBytes: 500000,
    width: 1024,
    height: 768,
  },
];

describe("resume before image lane", () => {
  const SESSION_ID = "44444444-4444-4444-4444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    intakeMocks.handleImageIntakeFromChatRoute.mockRejectedValue(new Error("image intake must not run"));
    repoMocks.loadConversationHydration.mockResolvedValue({
      channel: null,
      assistantMode: null,
      lockedContactId: null,
      metadata: { [PENDING_IMAGE_INTAKE_METADATA_KEY]: pendingPayload() },
    });
    routerMocks.routeAssistantMessageCanonical.mockResolvedValue({
      message: "generic",
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 0.5,
      sourcesSummary: [],
      sessionId: SESSION_ID,
      executionState: null,
      contextState: null,
    });
    contactSearchMock.searchContactsForAssistant.mockResolvedValue([
      { id: "c1", displayName: "Lucie Opalecká" },
    ]);
  });

  it("resolves client from text and does not invoke image intake when assets are present", async () => {
    const origFlag = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "true";

    const req = makeRequest({
      sessionId: SESSION_ID,
      message: "Lucie Opalecká",
      orchestration: "canonical",
      imageAssets: IMAGE_ASSETS,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(intakeMocks.handleImageIntakeFromChatRoute).not.toHaveBeenCalled();
    const body = (await res.json()) as { sourcesSummary?: string[] };
    expect(body.sourcesSummary?.some((s) => s.includes("image_intake_resume"))).toBe(true);

    process.env.IMAGE_INTAKE_ENABLED = origFlag ?? "";
  });
});
