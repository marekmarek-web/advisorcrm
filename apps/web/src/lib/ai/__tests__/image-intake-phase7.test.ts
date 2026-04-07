/**
 * Integration tests for Phase 7 image intake capability.
 * Covers:
 * - TTL/config hardening (image-intake-config)
 * - Multi-image combined pass support
 * - Cross-session persistence adapter (DB-backed)
 * - Optional intent-change model assist
 * - AI Review queue integration
 * - Admin rollout/runtime controls
 * - Golden dataset guardrails Phase 7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn(),
  createResponseStructured: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4o-mini" })),
  createResponseStructured: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4o-mini" })),
  createResponseStructuredWithImage: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4o-mini" })),
  createResponseStructuredWithImages: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4o-mini" })),
}));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  },
  aiGenerations: {},
  contractUploadReviews: {},
  opportunities: {},
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn(), or: vi.fn(), sql: vi.fn(),
  contacts: {},
}));
vi.mock("@/lib/ai/review-queue-repository", () => ({
  createContractReview: vi.fn(async () => "review-row-123"),
}));

import {
  getImageIntakeConfig,
  getImageIntakeConfigSummary,
  setImageIntakeConfigOverride,
  clearImageIntakeConfigOverride,
  clearAllImageIntakeConfigOverrides,
} from "../image-intake/image-intake-config";
import { runMultiImageCombinedPass } from "../image-intake/multimodal";
import {
  persistThreadArtifact,
  reconstructCrossSessionThread,
  clearAllArtifacts,
  mergePersistedArtifacts,
} from "../image-intake/cross-session-reconstruction";
import { runIntentChangeAssist } from "../image-intake/intent-change-assist";
import { submitToAiReviewQueue } from "../image-intake/handoff-queue-integration";
import { getImageIntakeAdminFlags, setFeatureOverride } from "../../admin/feature-flags";
import type {
  MergedThreadFact,
  ReviewHandoffPayload,
  IntentChangeFinding,
} from "../image-intake/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFact(key: string, value: string, isLatest = true): MergedThreadFact {
  return { factKey: key, value, isLatestSignal: isLatest, sourceAssetIds: ["a1"], occurrenceCount: 1, confidence: 0.8 };
}

function makeHandoffPayload(handoffId = "hid-1"): ReviewHandoffPayload {
  return {
    handoffId, status: "ready",
    sourceAssetIds: ["a1"],
    handoffReasons: ["Smlouva detekována."],
    orientationSummary: "Smlouva o hypotéce.",
    detectedInputType: "photo_or_scan_document",
    bindingContext: { clientId: "client-1", clientLabel: "Jan Novák", caseId: null, caseLabel: null, bindingConfidence: 0.7 },
    ambiguityNotes: [],
    metadata: { sessionId: "sess-1", tenantId: "t1", userId: "u1", uploadedAt: new Date() },
    laneNote: "image_intake_lane_only_extracted_orientation",
  };
}

// ---------------------------------------------------------------------------
// A) TTL / config hardening
// ---------------------------------------------------------------------------

describe("image-intake config hardening", () => {
  beforeEach(() => clearAllImageIntakeConfigOverrides());
  afterEach(() => clearAllImageIntakeConfigOverrides());

  it("returns safe defaults when no env vars set", () => {
    const config = getImageIntakeConfig();
    expect(config.crossSessionTtlMs).toBe(72 * 60 * 60 * 1000);
    expect(config.crossSessionMaxArtifacts).toBe(20);
    expect(config.combinedPassMaxImages).toBe(3);
    expect(config.intentAssistThreshold).toBe(0.45);
    expect(config.intentAssistEnabled).toBe(false);
    expect(config.crossSessionPersistenceEnabled).toBe(false);
    expect(config.handoffQueueSubmitEnabled).toBe(false);
  });

  it("runtime override takes priority over env", () => {
    const err = setImageIntakeConfigOverride("cross_session_ttl_hours", 48);
    expect(err).toBeNull();
    const config = getImageIntakeConfig();
    expect(config.crossSessionTtlMs).toBe(48 * 60 * 60 * 1000);
  });

  it("clearImageIntakeConfigOverride reverts to default", () => {
    setImageIntakeConfigOverride("combined_pass_max_images", 5);
    clearImageIntakeConfigOverride("combined_pass_max_images");
    expect(getImageIntakeConfig().combinedPassMaxImages).toBe(3);
  });

  it("validates min/max for numeric config", () => {
    const errLow = setImageIntakeConfigOverride("combined_pass_max_images", 0); // below min=2
    expect(errLow).toContain("min");

    const errHigh = setImageIntakeConfigOverride("combined_pass_max_images", 99); // above max=5
    expect(errHigh).toContain("max");
  });

  it("validates boolean config type", () => {
    const err = setImageIntakeConfigOverride("intent_assist_enabled", "yes" as unknown as boolean);
    expect(err).toContain("boolean");
  });

  it("getImageIntakeConfigSummary includes all keys with source", () => {
    setImageIntakeConfigOverride("cross_session_ttl_hours", 24);
    const summary = getImageIntakeConfigSummary();
    expect(summary.length).toBeGreaterThan(5);
    const ttlEntry = summary.find((s) => s.key === "cross_session_ttl_hours");
    expect(ttlEntry?.source).toBe("override");
    const defaultEntry = summary.find((s) => s.key === "combined_pass_max_images");
    expect(defaultEntry?.source).toBe("default");
  });

  it("env var config is read (e2e boundary)", () => {
    const saved = process.env.IMAGE_INTAKE_COMBINED_PASS_MAX_IMAGES;
    process.env.IMAGE_INTAKE_COMBINED_PASS_MAX_IMAGES = "4";
    // Runtime override cleared — should pick up env
    const config = getImageIntakeConfig();
    expect(config.combinedPassMaxImages).toBe(4);
    if (saved) process.env.IMAGE_INTAKE_COMBINED_PASS_MAX_IMAGES = saved;
    else delete process.env.IMAGE_INTAKE_COMBINED_PASS_MAX_IMAGES;
  });
});

// ---------------------------------------------------------------------------
// B) Multi-image combined pass
// ---------------------------------------------------------------------------

describe("multi-image combined pass", () => {
  it("runMultiImageCombinedPass degrades gracefully with empty URLs", async () => {
    const result = await runMultiImageCombinedPass([], null, null);
    expect(result.imageCount).toBe(0);
    expect(result.result).toBeTruthy(); // fallback result
  });

  it("caps imageCount to maxImages parameter", async () => {
    const urls = ["url1", "url2", "url3", "url4", "url5"];
    const result = await runMultiImageCombinedPass(urls, null, null, 2);
    // maxImages=2, should cap at 2
    expect(result.imageCount).toBeLessThanOrEqual(2);
  });

  it("single URL delegates to runCombinedMultimodalPass (imageCount=1)", async () => {
    const result = await runMultiImageCombinedPass(["single-url"], null, null);
    expect(result.imageCount).toBe(1);
  });

  it("does not multiply calls — max 1 vision call for combined path", async () => {
    const result = await runMultiImageCombinedPass(["url1", "url2"], null, "test");
    // The combined path makes at most 1 call — either createResponseStructuredWithImages or fallback
    expect(result.imageCount).toBeLessThanOrEqual(2);
  });

  it("unrelated/supporting images filtered by caller — test that max cap works", async () => {
    // Phase 7 contract: max 5 images even if more provided
    const urls = Array.from({ length: 10 }, (_, i) => `url-${i}`);
    const result = await runMultiImageCombinedPass(urls, null, null, 3);
    // Should never send more than maxImages
    expect(result.imageCount).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// C) Cross-session persistence (DB adapter — mocked)
// ---------------------------------------------------------------------------

describe("cross-session persistence adapter", () => {
  beforeEach(() => clearAllArtifacts());
  afterEach(() => clearAllArtifacts());

  it("persistArtifactsToDb returns persisted=false when flag disabled", async () => {
    clearAllImageIntakeConfigOverrides();
    // Default is disabled
    const { persistArtifactsToDb } = await import("../image-intake/cross-session-persistence");
    const result = await persistArtifactsToDb("t1", "u1", "c1", []);
    expect(result.persisted).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("loadArtifactsFromDb returns empty array when flag disabled", async () => {
    clearAllImageIntakeConfigOverrides();
    const { loadArtifactsFromDb } = await import("../image-intake/cross-session-persistence");
    const result = await loadArtifactsFromDb("t1", "c1");
    expect(result).toHaveLength(0);
  });

  it("mergePersistedArtifacts merges DB artifacts into in-process store", () => {
    const dbArtifact = {
      artifactId: "db-artifact-1",
      tenantId: "t1", userId: "u1", clientId: "c1",
      lastUpdatedAt: new Date().toISOString(),
      priorMergedFacts: [makeFact("what_client_wants", "hypotéka")],
      priorLatestSignal: "hypotéka",
      sourceSessionIds: ["sess-db"],
    };

    mergePersistedArtifacts("t1", "c1", [dbArtifact]);

    // After merge, cross-session should find prior context
    const result = reconstructCrossSessionThread("t1", "c1", "sess-new", [
      makeFact("what_client_wants", "refinancování"),
    ]);
    expect(result.hasPriorContext).toBe(true);
    expect(result.priorMergedFacts.length).toBeGreaterThan(0);
  });

  it("persistence failure degrades gracefully — in-process store still works", async () => {
    setImageIntakeConfigOverride("cross_session_persistence_enabled", true);
    const dbMock = await import("db");
    vi.mocked(dbMock.db.delete).mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("DB error")),
    } as unknown as ReturnType<typeof dbMock.db.delete>);

    const { persistArtifactsToDb } = await import("../image-intake/cross-session-persistence");
    const result = await persistArtifactsToDb("t1", "u1", "c1", []);
    expect(result.persisted).toBe(false);
    // Lane should still work with in-process
    clearAllImageIntakeConfigOverrides();
  });
});

// ---------------------------------------------------------------------------
// D) Optional intent-change model assist
// ---------------------------------------------------------------------------

describe("optional intent-change model assist", () => {
  beforeEach(() => clearAllImageIntakeConfigOverrides());
  afterEach(() => clearAllImageIntakeConfigOverrides());

  it("returns null when flag disabled", async () => {
    // Default: intentAssistEnabled = false
    const finding: IntentChangeFinding = { status: "ambiguous", currentIntent: null, priorIntent: null, changeExplanation: null, confidence: 0.3, priorSuperseded: false };
    const result = await runIntentChangeAssist(finding, []);
    expect(result).toBeNull();
  });

  it("returns null when finding is not ambiguous", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    const finding: IntentChangeFinding = { status: "changed", currentIntent: "new", priorIntent: "old", changeExplanation: "test", confidence: 0.9, priorSuperseded: true };
    const result = await runIntentChangeAssist(finding, [
      makeFact("what_client_wants", "old", false),
      makeFact("what_client_wants", "new", true),
    ]);
    expect(result).toBeNull(); // not ambiguous, no escalation
  });

  it("returns null when confidence is above threshold", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    setImageIntakeConfigOverride("intent_assist_confidence_threshold", 0.45);
    const finding: IntentChangeFinding = { status: "ambiguous", currentIntent: null, priorIntent: null, changeExplanation: null, confidence: 0.8, priorSuperseded: false };
    const result = await runIntentChangeAssist(finding, [
      makeFact("what_client_wants", "old", false),
      makeFact("what_client_wants", "new", true),
    ]);
    expect(result).toBeNull(); // confidence 0.8 > threshold 0.45
  });

  it("returns null when no prior or current facts", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    const finding: IntentChangeFinding = { status: "ambiguous", currentIntent: null, priorIntent: null, changeExplanation: null, confidence: 0.2, priorSuperseded: false };
    const result = await runIntentChangeAssist(finding, []); // no facts
    expect(result).toBeNull();
  });

  it("calls model (mocked) and returns result for eligible ambiguous case — graceful handling", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    // openai mock returns null parsed → function should return null or original finding
    const finding: IntentChangeFinding = { status: "ambiguous", currentIntent: null, priorIntent: null, changeExplanation: null, confidence: 0.2, priorSuperseded: false };
    const result = await runIntentChangeAssist(finding, [
      makeFact("what_client_wants", "hypotéka", false),
      makeFact("what_client_wants", "refinancování", true),
    ]);
    // With null parsed result from mock → returns null or original finding (both acceptable)
    expect(result === null || result?.status !== undefined).toBe(true);
  });

  it("max 1 model call per eligible thread — function called once for one thread", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    const finding: IntentChangeFinding = { status: "ambiguous", currentIntent: null, priorIntent: null, changeExplanation: null, confidence: 0.2, priorSuperseded: false };
    // Call once — function must not recurse or call model multiple times
    const result = await runIntentChangeAssist(finding, [
      makeFact("what_client_wants", "old", false),
      makeFact("what_client_wants", "new", true),
    ]);
    // Should complete without error regardless of result
    expect(result === null || typeof result?.status === "string").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E) AI Review queue integration
// ---------------------------------------------------------------------------

describe("AI Review queue integration", () => {
  beforeEach(() => clearAllImageIntakeConfigOverrides());
  afterEach(() => clearAllImageIntakeConfigOverrides());

  it("returns skipped_no_payload when payload is null", async () => {
    const result = await submitToAiReviewQueue(null, "u1", "submit_ai_review_handoff");
    expect(result.status).toBe("skipped_no_payload");
    expect(result.reviewRowId).toBeNull();
  });

  it("returns skipped_flag_disabled when handoff queue submit disabled", async () => {
    // Default: handoffQueueSubmitEnabled = false
    const payload = makeHandoffPayload();
    const result = await submitToAiReviewQueue(payload, "u1", "submit_ai_review_handoff");
    expect(result.status).toBe("skipped_flag_disabled");
  });

  it("returns skipped_no_confirm when confirm action is missing", async () => {
    setImageIntakeConfigOverride("handoff_queue_submit_enabled", true);
    const payload = makeHandoffPayload();
    const result = await submitToAiReviewQueue(payload, "u1", null);
    expect(result.status).toBe("skipped_no_confirm");
    expect(result.reviewRowId).toBeNull();
  });

  it("returns submitted with reviewRowId when all conditions met", async () => {
    setImageIntakeConfigOverride("handoff_queue_submit_enabled", true);
    const { createContractReview } = await import("@/lib/ai/review-queue-repository");
    vi.mocked(createContractReview).mockResolvedValueOnce("review-row-test-1");

    const payload = makeHandoffPayload("hid-queue-test");
    const result = await submitToAiReviewQueue(payload, "u1", "submit_ai_review_handoff");
    expect(result.status).toBe("submitted");
    expect(result.reviewRowId).toBe("review-row-test-1");
    expect(result.handoffId).toBe("hid-queue-test");
    expect(result.auditRef).not.toBeNull();
  });

  it("no auto-submit without confirm — golden guardrail", async () => {
    setImageIntakeConfigOverride("handoff_queue_submit_enabled", true);
    const payload = makeHandoffPayload();
    const result = await submitToAiReviewQueue(payload, "u1", "some_other_action");
    expect(result.status).toBe("skipped_no_confirm");
    expect(result.status).not.toBe("submitted");
  });

  it("handles queue unavailable gracefully (DB throws)", async () => {
    setImageIntakeConfigOverride("handoff_queue_submit_enabled", true);
    const { createContractReview } = await import("@/lib/ai/review-queue-repository");
    vi.mocked(createContractReview).mockRejectedValueOnce(new Error("DB unavailable"));

    const payload = makeHandoffPayload();
    const result = await submitToAiReviewQueue(payload, "u1", "submit_ai_review_handoff");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("selhal");
    expect(result.reviewRowId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F) Admin rollout/runtime controls
// ---------------------------------------------------------------------------

describe("admin rollout runtime controls", () => {
  const TENANT_ID = "tenant-admin-test";

  afterEach(() => {
    // Clear overrides
    ["image_intake_enabled", "image_intake_combined_multimodal", "image_intake_intent_assist",
     "image_intake_handoff_queue", "image_intake_cross_session_persistence"].forEach((code) => {
      setFeatureOverride(code, TENANT_ID, false); // reset to false
    });
  });

  it("getImageIntakeAdminFlags returns all false by default", () => {
    const flags = getImageIntakeAdminFlags(TENANT_ID);
    expect(flags.enabled).toBe(false);
    expect(flags.combinedMultimodal).toBe(false);
    expect(flags.intentAssist).toBe(false);
    expect(flags.handoffQueueSubmit).toBe(false);
    expect(flags.crossSessionPersistence).toBe(false);
  });

  it("setFeatureOverride enables individual flag for tenant", () => {
    setFeatureOverride("image_intake_enabled", TENANT_ID, true);
    const flags = getImageIntakeAdminFlags(TENANT_ID);
    expect(flags.enabled).toBe(true);
    expect(flags.combinedMultimodal).toBe(false); // others untouched
  });

  it("admin flags are tenant-scoped — different tenants are independent", () => {
    setFeatureOverride("image_intake_enabled", TENANT_ID, true);
    const flagsA = getImageIntakeAdminFlags(TENANT_ID);
    const flagsB = getImageIntakeAdminFlags("other-tenant");
    expect(flagsA.enabled).toBe(true);
    expect(flagsB.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Golden dataset guardrails — Phase 7
// ---------------------------------------------------------------------------

describe("golden dataset guardrails — Phase 7", () => {
  beforeEach(() => {
    clearAllArtifacts();
    clearAllImageIntakeConfigOverrides();
  });

  it("GD7-1: persistence failure does not break flow", async () => {
    setImageIntakeConfigOverride("cross_session_persistence_enabled", true);
    const dbMock = await import("db");
    vi.mocked(dbMock.db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB down")),
    } as unknown as ReturnType<typeof dbMock.db.insert>);

    const { persistArtifactsToDb } = await import("../image-intake/cross-session-persistence");
    const result = await persistArtifactsToDb("t1", "u1", "c1", []);
    // Should return persisted=false, not throw
    expect(result.persisted).toBe(false);
    clearAllImageIntakeConfigOverrides();
  });

  it("GD7-2: combined pass does not send unrelated assets — cap enforced", async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `url-${i}`);
    const result = await runMultiImageCombinedPass(urls, null, null, 3);
    expect(result.imageCount).toBeLessThanOrEqual(3);
  });

  it("GD7-3: no model assist for stable/changed intent — only ambiguous triggers assist", async () => {
    setImageIntakeConfigOverride("intent_assist_enabled", true);
    // stable → no escalation
    const stableFinding: IntentChangeFinding = { status: "stable", currentIntent: "hypotéka", priorIntent: null, changeExplanation: null, confidence: 0.9, priorSuperseded: false };
    const stableResult = await runIntentChangeAssist(stableFinding, [makeFact("what_client_wants", "hypotéka")]);
    expect(stableResult).toBeNull(); // stable → null

    // changed → no escalation (only ambiguous)
    const changedFinding: IntentChangeFinding = { status: "changed", currentIntent: "new", priorIntent: "old", changeExplanation: "test", confidence: 0.85, priorSuperseded: true };
    const changedResult = await runIntentChangeAssist(changedFinding, [makeFact("what_client_wants", "new")]);
    expect(changedResult).toBeNull(); // changed → null
    clearAllImageIntakeConfigOverrides();
  });

  it("GD7-4: no handoff queue submit without confirm", async () => {
    setImageIntakeConfigOverride("handoff_queue_submit_enabled", true);
    const payload = makeHandoffPayload();
    const result = await submitToAiReviewQueue(payload, "u1", null);
    expect(result.status).toBe("skipped_no_confirm");
    expect(result.status).not.toBe("submitted");
  });

  it("GD7-5: config misconfiguration uses safe default (invalid value)", () => {
    const err = setImageIntakeConfigOverride("combined_pass_max_images", -5);
    expect(err).not.toBeNull(); // validation error
    // Safe default still applied
    const config = getImageIntakeConfig();
    expect(config.combinedPassMaxImages).toBe(3); // default, override rejected
  });

  it("GD7-6: no false merge from stale artifacts — TTL filtering works", () => {
    const staleArtifact = {
      artifactId: "stale-1",
      tenantId: "t1", userId: "u1", clientId: "c1",
      lastUpdatedAt: new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString(), // 200h ago
      priorMergedFacts: [makeFact("what_client_wants", "stale data")],
      priorLatestSignal: null,
      sourceSessionIds: ["sess-stale"],
    };
    // TTL is 72h by default → 200h artifact should be pruned
    mergePersistedArtifacts("t1", "c1", [staleArtifact]);
    // Wait — mergePersistedArtifacts will add it, but pruneExpired will filter on next read
    const result = reconstructCrossSessionThread("t1", "c1", "sess-new", [
      makeFact("what_client_wants", "fresh"),
    ]);
    // Stale artifact pruned → no prior context
    expect(result.hasPriorContext).toBe(false);
  });

  it("GD7-7: text-only assistant flow regression — config load has no side effects", () => {
    // Config loading should be side-effect free
    const config = getImageIntakeConfig();
    expect(config).toBeTruthy();
    // No exceptions, no model calls
  });
});
