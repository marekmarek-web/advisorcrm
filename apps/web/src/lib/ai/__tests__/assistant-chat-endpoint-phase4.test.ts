import { beforeEach, describe, expect, it, vi } from "vitest";

const CONTACT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const repoMocks = vi.hoisted(() => ({
  loadConversationHydration: vi.fn().mockResolvedValue(null),
  loadRecentConversationMessagesForUser: vi.fn().mockResolvedValue([
    { id: "m1", role: "user", content: "Předchozí otázka na klienta.", createdAt: new Date(), meta: null },
  ]),
  loadResumableExecutionPlanSnapshot: vi.fn().mockResolvedValue(null),
  upsertConversationFromSession: vi.fn().mockResolvedValue(undefined),
  appendConversationMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

vi.mock("@/lib/auth/get-membership", () => ({
  getMembership: vi.fn().mockResolvedValue({
    tenantId: "tenant-1",
    roleName: "Advisor",
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  logAuditAction: vi.fn(),
}));

vi.mock("@/lib/observability/assistant-sentry", () => ({
  captureAssistantApiError: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => unknown) => cb(),
  };
});

vi.mock("@/lib/ai/assistant-conversation-repository", () => ({
  loadConversationHydration: repoMocks.loadConversationHydration,
  loadRecentConversationMessagesForUser: repoMocks.loadRecentConversationMessagesForUser,
  loadResumableExecutionPlanSnapshot: repoMocks.loadResumableExecutionPlanSnapshot,
  upsertConversationFromSession: repoMocks.upsertConversationFromSession,
  appendConversationMessage: repoMocks.appendConversationMessage,
}));

vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn().mockResolvedValue({ parsed: {} }),
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "ok" }),
  createResponseStructuredWithImage: vi.fn().mockResolvedValue({ parsed: { reply: "vision ok" } }),
  createResponseStructuredWithImages: vi.fn().mockResolvedValue({ parsed: { reply: "vision ok" } }),
  logOpenAICall: vi.fn(),
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
  opportunities: {},
  documents: {},
  opportunityStages: {},
  contractUploadReviews: {},
  clientPaymentSetups: {},
  contractReviewCorrections: {},
}));

import { POST } from "../../../app/api/ai/assistant/chat/route";
import { clearSession, getOrCreateSession } from "../assistant-session";
import { extractCanonicalIntent } from "../assistant-intent-extract";
import * as entityResolution from "../assistant-entity-resolution";
import * as openai from "@/lib/openai";

type CanonicalIntentResult = Awaited<ReturnType<typeof extractCanonicalIntent>>;
type EntityResolutionResult = Awaited<ReturnType<typeof entityResolution.resolveEntities>>;

function canonicalBase(overrides: Partial<CanonicalIntentResult>): CanonicalIntentResult {
  return {
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
    confidence: 0.7,
    requiresConfirmation: false,
    switchClient: false,
    noEmail: false,
    userConstraints: [],
    ...overrides,
  };
}

function resolutionBase(overrides: Partial<EntityResolutionResult>): EntityResolutionResult {
  return {
    client: null,
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
    ...overrides,
  };
}

function resolvedClient(id: string, label: string, ambiguous = false): NonNullable<EntityResolutionResult["client"]> {
  return {
    entityType: "contact",
    entityId: id,
    displayLabel: label,
    confidence: ambiguous ? 0.6 : 1,
    ambiguous,
    alternatives: ambiguous ? [{ id: CONTACT_B, label: "Petr Novák" }] : [],
  };
}

async function postChat(body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/ai/assistant/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "user-1",
    },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  const json = await response.json();
  return { response, json };
}

describe("Phase 4: assistant chat endpoint parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.loadConversationHydration.mockResolvedValue(null);
    repoMocks.loadResumableExecutionPlanSnapshot.mockResolvedValue(null);
  });

  it("endpoint returns canonical mortgage preview with 3 expected actions", async () => {
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Test Novák"),
      }),
    );

    const { response, json } = await postChat({
      orchestration: "canonical",
      message: "Klient Test Novák chce hypotéku 4 000 000 Kč, vytvoř obchod, interní poznámku a požadavek na občanku.",
      activeContext: { clientId: CONTACT_A },
    });

    expect(response.status).toBe(200);
    expect(json.executionState?.status).toBe("awaiting_confirmation");
    expect(json.executionState?.stepPreviews).toHaveLength(3);
    expect(json.executionState?.stepPreviews.map((s: { label: string }) => s.label)).toEqual(
      expect.arrayContaining(["Vytvořit obchod", "Vytvořit interní poznámku", "Vytvořit požadavek klienta"]),
    );
    expect(json.contextState?.lockedClientId).toBe(CONTACT_A);
    expect(json.executionState?.clientLabel).toBe("Test Novák");
  });

  it("endpoint applies implicit investment playbook bundle end-to-end", async () => {
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Marek Marek"),
      }),
    );

    const { json } = await postChat({
      orchestration: "canonical",
      message: "Marek Marek chce investice 10 000 měsíčně do fondu ATRIS.",
      activeContext: { clientId: CONTACT_A },
    });

    expect(json.executionState?.status).toBe("awaiting_confirmation");
    expect(json.executionState?.stepPreviews.map((s: { label: string }) => s.label)).toEqual(
      expect.arrayContaining(["Vytvořit obchod", "Vytvořit úkol", "Vytvořit požadavek klienta"]),
    );
    expect(json.message).not.toMatch(/hypoték/i);
  });

  it("endpoint keeps meeting without time in draft/needs_input", async () => {
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Test Novák"),
      }),
    );

    const { json } = await postChat({
      orchestration: "canonical",
      message: "Naplánuj schůzku s klientem příští úterý.",
      activeContext: { clientId: CONTACT_A },
    });

    expect(json.executionState?.status).toBe("draft");
    expect(json.executionState?.stepPreviews?.[0]?.preflightStatus).toBe("needs_input");
    expect(json.message).toMatch(/doplňte konkrétní čas|doplnit/i);
  });

  it("endpoint blocks ambiguous client writes", async () => {
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Jan Novák", true),
        warnings: ["Nalezeno více klientů pro „Novák“."],
      }),
    );

    const { json } = await postChat({
      orchestration: "canonical",
      message: "Založ obchod pro Nováka.",
    });

    expect(json.executionState ?? null).toBeNull();
    expect(json.message).toMatch(/více klientů|upřesněte/i);
  });

  it("passes unified context into canonical intent extraction", async () => {
    const extractSpy = vi.spyOn(await import("../assistant-intent-extract"), "extractCanonicalIntent");
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Jan Novák"),
      }),
    );

    await postChat({
      orchestration: "canonical",
      message: "Udělej s tím něco",
      activeContext: { clientId: CONTACT_A },
    });

    expect(extractSpy).toHaveBeenCalledWith(
      "Udělej s tím něco",
      expect.objectContaining({
        recentMessages: expect.any(Array),
        resolvedContextBlock: expect.stringContaining("Aktivní klient v UI"),
      }),
    );
  });

  it("endpoint rating reply reports EUCS source when using life product rating", async () => {
    const { json } = await postChat({
      orchestration: "canonical",
      message: "Jaké životní pojištění má nejlepší rating?",
    });

    expect(json.message).toMatch(/EUCS|rating je pouze informativní/i);
    expect(json.sourcesSummary).toEqual(["EUCS rating (interní podklad)"]);
  });

  it("endpoint switches locked client when explicit new client appears in same session", async () => {
    const session = getOrCreateSession(undefined, "tenant-1", "user-1");
    session.lockedClientId = CONTACT_A;

    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_B, "Petr Svoboda"),
      }),
    );

    const { json } = await postChat({
      orchestration: "canonical",
      sessionId: session.sessionId,
      message: "Teď klient Petr Svoboda, vytvoř obchod na investice 5 000 Kč měsíčně.",
      activeContext: { clientId: CONTACT_A },
    });

    expect(json.contextState?.lockedClientId).toBe(CONTACT_B);
    expect(json.executionState?.clientLabel).toBe("Petr Svoboda");

    clearSession(session.sessionId);
  });

  it("endpoint response stays sanitized without raw IDs in preview message", async () => {
    vi.spyOn(entityResolution, "resolveEntities").mockResolvedValueOnce(
      resolutionBase({
        client: resolvedClient(CONTACT_A, "Test Novák"),
      }),
    );

    const { json } = await postChat({
      orchestration: "canonical",
      message: "Klient chce povko a havko.",
      activeContext: { clientId: CONTACT_A },
    });

    expect(json.message).not.toMatch(/contactId|planId|sessionId|tenantId|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(json.executionState?.stepPreviews?.every((s: { description?: string }) => !/raw|json|contactId|entityId/i.test(s.description ?? ""))).toBe(true);
  });

  it("passes recent messages and image assets into generic assistant fallback", async () => {
    const { json } = await postChat({
      orchestration: "legacy",
      message: "Co je na tom screenshotu?",
      imageAssets: [{ url: "https://example.com/screen.png", mimeType: "image/png" }],
    });

    expect(json.message).toBe("vision ok");
    expect(vi.mocked(openai.createResponseStructuredWithImage)).toHaveBeenCalled();
  });
});
