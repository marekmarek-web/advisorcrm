/**
 * Image Intake — pending client resolution / continuation flow tests.
 *
 * Covers:
 * 1. ambiguous_needs_input → pending state saved
 * 2. user supplies client name → client resolved → resume works
 * 3. user text without pending state → falls through to normal text chat
 * 4. multiple client matches → ambiguity remains, candidates updated
 * 5. resolved client → screenshot facts reused, no generic fallback greeting
 * 6. expired pending resolution → cleared, expiry response returned
 * 7. long/complex message with pending state → sentinel (fall-through), not consumed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/assistant-contact-search", () => ({
  searchContactsForAssistant: vi.fn(),
}));

// extractor is pure
vi.mock("@/lib/ai/image-intake/extractor", () => ({
  buildFactsSummaryLines: vi.fn(() => ["Datum: 15. 3. 2025", "Klient: Lucie Opalecká"]),
}));

import { searchContactsForAssistant } from "@/lib/ai/assistant-contact-search";
import {
  hasPendingImageIntakeResolution,
  resumeImageIntakeWithClientResolution,
  INTAKE_RESUME_FALLTHROUGH,
} from "@/lib/ai/image-intake/client-resolution";
import type { AssistantSession } from "@/lib/ai/assistant-session";
import type { PendingImageIntakeResolution } from "@/lib/ai/assistant-session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    sessionId: "sess-test",
    tenantId: "tenant-1",
    userId: "user-1",
    assistantMode: "quick_assistant",
    contextLock: { assistantMode: "quick_assistant" } as any,
    lastSuggestedActions: [],
    lastWarnings: [],
    messageCount: 0,
    createdAt: new Date(),
    ...overrides,
  } as AssistantSession;
}

function makePending(overrides: Partial<PendingImageIntakeResolution> = {}): PendingImageIntakeResolution {
  return {
    intakeId: "img_abc123",
    factBundle: {
      facts: [
        {
          factType: "deadline_date",
          factKey: "date",
          value: "15. 3. 2025",
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. hasPendingImageIntakeResolution
// ---------------------------------------------------------------------------

describe("hasPendingImageIntakeResolution", () => {
  it("returns false when no pending resolution", () => {
    const session = makeSession();
    expect(hasPendingImageIntakeResolution(session)).toBe(false);
  });

  it("returns true when pending resolution exists and is fresh", () => {
    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    expect(hasPendingImageIntakeResolution(session)).toBe(true);
  });

  it("returns false and clears when pending resolution is expired (>15 min)", () => {
    const expired = makePending({ createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
    const session = makeSession({ pendingImageIntakeResolution: expired });
    expect(hasPendingImageIntakeResolution(session)).toBe(false);
    expect(session.pendingImageIntakeResolution).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. user text without pending state — must not enter resume logic
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — no pending state", () => {
  it("should not be called when there is no pending state (guard: hasPendingImageIntakeResolution is false)", () => {
    const session = makeSession();
    // Verify the guard function returns false — the route won't call resume
    expect(hasPendingImageIntakeResolution(session)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. long / complex message → sentinel (fall-through to text router)
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — fall-through sentinel", () => {
  it("returns INTAKE_RESUME_FALLTHROUGH for long command-like messages", async () => {
    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    const result = await resumeImageIntakeWithClientResolution(
      "Vytvoř úkol pro Lucii Opaleckou s termínem do konce týdne",
      session,
      "tenant-1",
    );
    expect(result.message).toBe(INTAKE_RESUME_FALLTHROUGH);
    // Pending state must NOT be cleared — user can still try to supply name
    expect(session.pendingImageIntakeResolution).not.toBeNull();
  });

  it("returns INTAKE_RESUME_FALLTHROUGH for question messages", async () => {
    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    const result = await resumeImageIntakeWithClientResolution(
      "Co mám dnes?",
      session,
      "tenant-1",
    );
    expect(result.message).toBe(INTAKE_RESUME_FALLTHROUGH);
  });
});

// ---------------------------------------------------------------------------
// 4. user supplies name → single match → resolved → facts reused
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — successful resume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves client from CRM and returns intake-flavored response (not a generic greeting)", async () => {
    (searchContactsForAssistant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "contact-123", displayName: "Lucie Opalecká" },
    ]);

    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    const result = await resumeImageIntakeWithClientResolution("Lucie Opalecká", session, "tenant-1");

    // Must confirm the client
    expect(result.message).toContain("Lucie Opalecká");
    // Must reuse extracted facts (extractor mock returns ["Datum: 15. 3. 2025", ...])
    expect(result.message).toContain("Datum: 15. 3. 2025");
    // Must NOT be a generic greeting
    expect(result.message).not.toMatch(/Dobrý den.*jak vám mohu pomoci/i);
    // Sources must indicate resume
    expect(result.sourcesSummary?.[0]).toContain("image_intake_resume");
    // Session must be locked on the resolved client
    expect(session.lockedClientId).toBe("contact-123");
    // Pending state must be cleared
    expect(session.pendingImageIntakeResolution).toBeNull();
  });

  it("picks from existing candidates when user message matches label substring", async () => {
    const session = makeSession({
      pendingImageIntakeResolution: makePending({
        bindingState: "multiple_candidates",
        candidates: [
          { id: "contact-123", label: "Lucie Opalecká" },
          { id: "contact-456", label: "Lucie Nováková" },
        ],
      }),
    });

    // User picks by last name — only "Opalecká" matches
    const result = await resumeImageIntakeWithClientResolution("Opalecká", session, "tenant-1");

    // Should not need CRM lookup at all (candidates already loaded)
    expect(searchContactsForAssistant).not.toHaveBeenCalled();
    expect(result.message).toContain("Lucie Opalecká");
    expect(session.lockedClientId).toBe("contact-123");
    expect(session.pendingImageIntakeResolution).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. multiple CRM matches → ambiguity remains, candidates updated
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — multiple matches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns disambiguation response and keeps pending state with updated candidates", async () => {
    (searchContactsForAssistant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "contact-123", displayName: "Lucie Opalecká" },
      { id: "contact-789", displayName: "Lucie Opalecká Nová" },
    ]);

    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    const result = await resumeImageIntakeWithClientResolution("Lucie", session, "tenant-1");

    // Must present the candidates to the user
    expect(result.message).toContain("Lucie Opalecká");
    expect(result.message).toContain("Lucie Opalecká Nová");
    // Must NOT clear the pending state
    expect(session.pendingImageIntakeResolution).not.toBeNull();
    // Candidates must be updated to the new subset
    expect(session.pendingImageIntakeResolution?.candidates).toHaveLength(2);
    // Must NOT be a generic greeting
    expect(result.message).not.toMatch(/Dobrý den.*jak vám mohu pomoci/i);
  });
});

// ---------------------------------------------------------------------------
// 6. CRM returns no match → client not found, pending kept
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — not found", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns not-found response and keeps pending state", async () => {
    (searchContactsForAssistant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const session = makeSession({ pendingImageIntakeResolution: makePending() });
    const result = await resumeImageIntakeWithClientResolution("Petr Zuma", session, "tenant-1");

    expect(result.message).toContain("Petr Zuma");
    expect(result.message).toContain("nenašel");
    // Pending state kept so user can retry
    expect(session.pendingImageIntakeResolution).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. expired pending resolution
// ---------------------------------------------------------------------------

describe("resumeImageIntakeWithClientResolution — expired", () => {
  it("returns expiry message and clears pending state", async () => {
    const expired = makePending({ createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
    const session = makeSession({ pendingImageIntakeResolution: expired });

    const result = await resumeImageIntakeWithClientResolution("Lucie", session, "tenant-1");

    expect(result.message).toContain("vypršelo");
    expect(session.pendingImageIntakeResolution).toBeNull();
  });
});
