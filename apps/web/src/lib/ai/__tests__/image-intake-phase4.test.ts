/**
 * Integration tests for Phase 4 image intake capability.
 * Covers:
 * - Multi-image stitching v1 (duplicate detection, thread grouping, standalone)
 * - Case/opportunity binding v2 (active context, DB lookup, multiple candidates)
 * - AI Review handoff boundary v1 (signal detection, lane separation)
 * - Action planning v3 with handoff recommendation
 * - Rollout flag states
 * - Golden dataset guardrails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn(),
  createResponseStructured: vi.fn(),
  createResponseStructuredWithImage: vi.fn(),
}));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    })),
  },
  opportunities: { id: "id", tenantId: "tenantId", contactId: "contactId", title: "title", archivedAt: "archivedAt", updatedAt: "updatedAt" },
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  contacts: {},
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("../image-intake/feature-flag", () => ({
  isImageIntakeEnabled: vi.fn(() => true),
  isImageIntakeMultimodalEnabled: vi.fn(() => false),
  isImageIntakeStitchingEnabled: vi.fn(() => true),
  isImageIntakeReviewHandoffEnabled: vi.fn(() => true),
  getImageIntakeClassifierConfig: vi.fn(() => ({ model: undefined, routingCategory: "copilot", maxOutputTokens: 120 })),
  getImageIntakeMultimodalConfig: vi.fn(() => ({ model: undefined, routingCategory: "copilot" })),
  getImageIntakeFlagState: vi.fn(() => "enabled"),
  getImageIntakeMultimodalFlagState: vi.fn(() => "disabled"),
  getImageIntakeStitchingFlagState: vi.fn(() => "enabled"),
  getImageIntakeReviewHandoffFlagState: vi.fn(() => "enabled"),
  getImageIntakeFlagSummary: vi.fn(() => ({
    base: "enabled", multimodal: "disabled", stitching: "enabled", review_handoff: "enabled",
  })),
}));

import {
  computeStitchingGroups,
  getPrimaryAssetIds,
  buildStitchingSummary,
} from "../image-intake/stitching";
import { resolveCaseBindingV2 } from "../image-intake/binding-v2";
import { evaluateReviewHandoff } from "../image-intake/review-handoff";
import { buildActionPlanV3 } from "../image-intake/planner";
import type {
  NormalizedImageAsset,
  InputClassificationResult,
  ExtractedFactBundle,
  ImageIntakeRequest,
  MultimodalCombinedPassResult,
  ReviewHandoffRecommendation,
} from "../image-intake/types";
import { emptyFactBundle } from "../image-intake/types";
import { db } from "db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let assetCounter = 0;

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  assetCounter++;
  return {
    assetId: `asset-${assetCounter}`,
    originalFilename: `img_${assetCounter}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 500_000,
    width: 1080,
    height: 1920,
    contentHash: `hash-${assetCounter}`,
    storageUrl: `https://storage.example.com/img_${assetCounter}.jpg`,
    thumbnailUrl: null,
    uploadedAt: new Date(),
    ...overrides,
  };
}

function makeClassification(
  inputType: InputClassificationResult["inputType"],
  confidence = 0.85,
): InputClassificationResult {
  return {
    inputType,
    subtype: null,
    confidence,
    containsText: true,
    likelyMessageThread: inputType === "screenshot_client_communication",
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: inputType === "screenshot_payment_details",
    likelyFinancialInfo: inputType === "screenshot_bank_or_finance_info",
    uncertaintyFlags: [],
  };
}

function makeRequest(overrides: Partial<ImageIntakeRequest> = {}): ImageIntakeRequest {
  return {
    sessionId: "sess-phase4",
    tenantId: "tenant-1",
    userId: "user-1",
    assets: [makeAsset()],
    activeClientId: null,
    activeOpportunityId: null,
    activeCaseId: null,
    accompanyingText: null,
    channel: null,
    ...overrides,
  };
}

function makeDocumentFactBundle(): ExtractedFactBundle {
  return {
    facts: [
      {
        factType: "document_received", value: "Pojistná smlouva ŽP",
        normalizedValue: null, confidence: 0.88,
        evidence: { sourceAssetId: "a1", evidenceText: "Pojistná smlouva ŽP", sourceRegion: null, confidence: 0.88 },
        isActionable: false, needsConfirmation: false,
        observedVsInferred: "observed", factKey: "document_summary",
      },
      {
        factType: "document_received", value: "yes",
        normalizedValue: null, confidence: 0.80,
        evidence: null,
        isActionable: false, needsConfirmation: false,
        observedVsInferred: "observed", factKey: "looks_like_contract",
      },
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

/** Backoffice / CRM form screenshot: many structured fields + insurance wording. */
function makeStructuredFormFactBundle(): ExtractedFactBundle {
  const f = (
    factKey: string,
    value: string,
  ): ExtractedFactBundle["facts"][number] => ({
    factType: "document_received",
    value,
    normalizedValue: null,
    confidence: 0.85,
    evidence: null,
    isActionable: true,
    needsConfirmation: false,
    observedVsInferred: "observed",
    factKey,
  });
  return {
    facts: [
      f("first_name", "Roman"),
      f("last_name", "Koloburda"),
      f("email", "komas157@seznam.cz"),
      f("phone", "+420608619703"),
      // Would otherwise contribute to contract_like / insurance handoff signals
      f("document_type", "pojistná smlouva"),
      f("contract_number", "8801837082"),
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

function makeConfidentClientBinding() {
  return {
    state: "bound_client_confident" as const,
    clientId: "client-123",
    clientLabel: "Jan Novák",
    confidence: 0.9,
    candidates: [],
    source: "session_context" as const,
    warnings: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  assetCounter = 0;
});

// ===========================================================================
// MULTI-IMAGE STITCHING TESTS
// ===========================================================================

describe("computeStitchingGroups — duplicate detection", () => {
  it("detects exact duplicates via content hash", () => {
    const a = makeAsset({ contentHash: "hash-same" });
    const b = makeAsset({ contentHash: "hash-same" });
    const result = computeStitchingGroups([a, b], new Map());

    expect(result.duplicateAssetIds).toContain(b.assetId);
    const dupGroup = result.groups.find((g) => g.decision === "duplicate");
    expect(dupGroup).toBeTruthy();
    expect(dupGroup!.primaryAssetId).toBe(a.assetId);
    expect(dupGroup!.duplicateAssetIds).toContain(b.assetId);
  });

  it("detects near-duplicates via size + resolution similarity", () => {
    const a = makeAsset({ contentHash: null, sizeBytes: 500_000, width: 1080, height: 1920 });
    const b = makeAsset({ contentHash: null, sizeBytes: 502_000, width: 1081, height: 1922 });
    const result = computeStitchingGroups([a, b], new Map());

    expect(result.duplicateAssetIds).toContain(b.assetId);
  });

  it("does NOT merge assets with different MIME types as near-duplicate", () => {
    const a = makeAsset({ contentHash: null, mimeType: "image/jpeg", sizeBytes: 500_000 });
    const b = makeAsset({ contentHash: null, mimeType: "image/png", sizeBytes: 500_000 });
    const result = computeStitchingGroups([a, b], new Map());

    expect(result.duplicateAssetIds).not.toContain(b.assetId);
  });

  it("duplicate image does NOT generate duplicate action proposals (via getPrimaryAssetIds)", () => {
    const a = makeAsset({ contentHash: "hash-dup" });
    const b = makeAsset({ contentHash: "hash-dup" });
    const result = computeStitchingGroups([a, b], new Map());

    const primaryIds = getPrimaryAssetIds(result);
    expect(primaryIds).toHaveLength(1);
    expect(primaryIds[0]).toBe(a.assetId);
    expect(primaryIds).not.toContain(b.assetId);
  });
});

describe("computeStitchingGroups — thread grouping", () => {
  // For thread/grouping tests we use clearly different sizes/resolutions to avoid
  // near-duplicate heuristic triggering (different sizeBytes & dimensions)
  function makeDistinctAssets(hash1: string, hash2: string) {
    const a = makeAsset({ contentHash: hash1, sizeBytes: 300_000, width: 1080, height: 1920 });
    const b = makeAsset({ contentHash: hash2, sizeBytes: 700_000, width: 1440, height: 2560 });
    return { a, b };
  }

  it("groups communication screenshots as grouped_thread", () => {
    const { a, b } = makeDistinctAssets("comm-h1", "comm-h2");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("screenshot_client_communication")],
    ]);
    const result = computeStitchingGroups([a, b], classMap);

    const threadGroup = result.groups.find((g) => g.decision === "grouped_thread");
    expect(threadGroup).toBeTruthy();
    expect(result.hasGroupedAssets).toBe(true);
  });

  it("groups payment screenshots as grouped_related", () => {
    const { a, b } = makeDistinctAssets("pay-p1", "pay-p2");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_payment_details")],
      [b.assetId, makeClassification("screenshot_payment_details")],
    ]);
    const result = computeStitchingGroups([a, b], classMap);

    const relatedGroup = result.groups.find((g) => g.decision === "grouped_related");
    expect(relatedGroup).toBeTruthy();
  });

  it("does NOT group communication screenshot with payment screenshot", () => {
    const { a, b } = makeDistinctAssets("mixed-c1", "mixed-c2");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("screenshot_payment_details")],
    ]);
    const result = computeStitchingGroups([a, b], classMap);

    const grouped = result.groups.filter((g) => g.decision === "grouped_thread" || g.decision === "grouped_related");
    expect(grouped).toHaveLength(0);
    expect(result.standaloneAssetIds).toContain(a.assetId);
    expect(result.standaloneAssetIds).toContain(b.assetId);
  });

  it("supporting/reference images remain standalone (not merged with communication)", () => {
    const { a, b } = makeDistinctAssets("sup-s1", "sup-s2");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("supporting_reference_image")],
    ]);
    const result = computeStitchingGroups([a, b], classMap);

    const commGroup = result.groups.find((g) => g.assetIds.includes(a.assetId));
    const supGroup = result.groups.find((g) => g.assetIds.includes(b.assetId));
    // They should be in different groups
    expect(commGroup?.groupId).not.toBe(supGroup?.groupId);
  });

  it("unrelated images (mixed types) stay standalone", () => {
    const { a, b } = makeDistinctAssets("unrel-u1", "unrel-u2");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("photo_or_scan_document")],
    ]);
    const result = computeStitchingGroups([a, b], classMap);

    expect(result.standaloneAssetIds).toContain(a.assetId);
    expect(result.standaloneAssetIds).toContain(b.assetId);
    expect(result.hasGroupedAssets).toBe(false);
  });

  it("single asset returns standalone group", () => {
    const a = makeAsset();
    const result = computeStitchingGroups([a], new Map());

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.decision).toBe("standalone");
    expect(result.hasGroupedAssets).toBe(false);
  });
});

describe("buildStitchingSummary", () => {
  it("returns null when no grouping or duplicates", () => {
    const a = makeAsset({ contentHash: "x1" });
    const result = computeStitchingGroups([a], new Map());
    expect(buildStitchingSummary(result)).toBeNull();
  });

  it("includes duplicate suppression message when duplicates found", () => {
    const a = makeAsset({ contentHash: "dup-hash-x" });
    const b = makeAsset({ contentHash: "dup-hash-x" });  // same hash → exact duplicate
    const result = computeStitchingGroups([a, b], new Map());
    const summary = buildStitchingSummary(result);
    expect(summary).not.toBeNull();
    expect(summary).toContain("dup");
  });
});

// ===========================================================================
// CASE / OPPORTUNITY BINDING V2 TESTS
// ===========================================================================

describe("resolveCaseBindingV2", () => {
  it("returns active context binding when session has lockedOpportunityId", async () => {
    const session = { lockedOpportunityId: "opp-locked-1" } as any;
    const result = await resolveCaseBindingV2(makeRequest(), session, null);

    expect(result.state).toBe("bound_case_from_active_context");
    expect(result.caseId).toBe("opp-locked-1");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.source).toBe("active_context");
  });

  it("returns active context from request.activeOpportunityId", async () => {
    const result = await resolveCaseBindingV2(
      makeRequest({ activeOpportunityId: "opp-ui-1" }),
      null,
      null,
    );
    expect(result.state).toBe("bound_case_from_active_context");
    expect(result.caseId).toBe("opp-ui-1");
    expect(result.source).toBe("active_context");
  });

  it("returns unresolved when no context and no client", async () => {
    const result = await resolveCaseBindingV2(makeRequest(), null, null);
    expect(result.state).toBe("unresolved_case");
    expect(result.caseId).toBeNull();
  });

  it("returns unresolved when client-scoped lookup returns empty", async () => {
    const mockDb = vi.mocked(db);
    const limitMock = vi.fn(async () => []);
    (mockDb.select as any).mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: limitMock })) })) })),
    });

    const result = await resolveCaseBindingV2(makeRequest(), null, "client-123");
    expect(result.state).toBe("unresolved_case");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns bound_case_from_strong_lookup for single DB match", async () => {
    const mockDb = vi.mocked(db);
    (mockDb.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: "opp-1", title: "Hypotéka Novák" }]),
          })),
        })),
      })),
    });

    const result = await resolveCaseBindingV2(makeRequest(), null, "client-123");
    expect(result.state).toBe("bound_case_from_strong_lookup");
    expect(result.caseId).toBe("opp-1");
    expect(result.caseLabel).toBe("Hypotéka Novák");
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns multiple_case_candidates for multiple DB matches (no auto-pick)", async () => {
    const mockDb = vi.mocked(db);
    (mockDb.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: "opp-A", title: "Hypotéka" },
              { id: "opp-B", title: "Životní pojistka" },
            ]),
          })),
        })),
      })),
    });

    const result = await resolveCaseBindingV2(makeRequest(), null, "client-123");
    expect(result.state).toBe("multiple_case_candidates");
    expect(result.caseId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("no confident case binding without sufficient evidence", async () => {
    const mockDb = vi.mocked(db);
    (mockDb.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: "opp-X", title: "Case 1" },
              { id: "opp-Y", title: "Case 2" },
            ]),
          })),
        })),
      })),
    });

    const result = await resolveCaseBindingV2(makeRequest(), null, "client-456");
    expect(result.state).toBe("multiple_case_candidates");
    expect(result.confidence).toBe(0.0);
  });
});

// ===========================================================================
// AI REVIEW HANDOFF BOUNDARY TESTS
// ===========================================================================

describe("evaluateReviewHandoff", () => {
  it("recommends handoff for contract-like document with looks_like_contract=yes", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const factBundle = makeDocumentFactBundle();
    const result = evaluateReviewHandoff(classification, factBundle, true);

    expect(result.recommended).toBe(true);
    expect(result.signals).toContain("contract_like_document");
    expect(result.handoffReady).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("does NOT recommend handoff for screenshot_client_communication (hard exclusion)", () => {
    const classification = makeClassification("screenshot_client_communication", 0.9);
    const result = evaluateReviewHandoff(classification, emptyFactBundle(), true);

    expect(result.recommended).toBe(false);
    expect(result.handoffReady).toBe(false);
  });

  it("does NOT recommend handoff for screenshot_payment_details (hard exclusion)", () => {
    const classification = makeClassification("screenshot_payment_details", 0.9);
    const result = evaluateReviewHandoff(classification, emptyFactBundle(), true);

    expect(result.recommended).toBe(false);
    expect(result.handoffReady).toBe(false);
  });

  it("does NOT recommend handoff for general_unusable_image", () => {
    const classification = makeClassification("general_unusable_image", 0.95);
    const result = evaluateReviewHandoff(classification, emptyFactBundle(), true);

    expect(result.recommended).toBe(false);
  });

  it("does NOT set handoffReady when flag is disabled even if signals found", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const factBundle = makeDocumentFactBundle();
    const result = evaluateReviewHandoff(classification, factBundle, false); // flag off

    expect(result.recommended).toBe(true);
    expect(result.handoffReady).toBe(false); // flag gates this
  });

  it("does NOT recommend handoff for supporting_reference_image", () => {
    const classification = makeClassification("supporting_reference_image", 0.9);
    const result = evaluateReviewHandoff(classification, emptyFactBundle(), true);

    expect(result.recommended).toBe(false);
  });

  it("includes orientation summary when document_summary fact is available", () => {
    const classification = makeClassification("photo_or_scan_document", 0.8);
    const factBundle = makeDocumentFactBundle();
    const result = evaluateReviewHandoff(classification, factBundle, true);

    expect(result.orientationSummary).toBeTruthy();
    expect(result.orientationSummary).toContain("Pojistná smlouva");
  });

  it("null classification returns no handoff", () => {
    const result = evaluateReviewHandoff(null, emptyFactBundle(), true);
    expect(result.recommended).toBe(false);
  });

  it("does NOT recommend handoff for structured backoffice form screenshot (CRM extraction path)", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const factBundle = makeStructuredFormFactBundle();
    const result = evaluateReviewHandoff(classification, factBundle, true);

    expect(result.recommended).toBe(false);
    expect(result.handoffReady).toBe(false);
    expect(result.signals).toHaveLength(0);
  });
});

// ===========================================================================
// ACTION PLANNING V3 TESTS
// ===========================================================================

describe("buildActionPlanV3", () => {
  it("surfaces handoff as safety flag when document looks like review candidate", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const binding = makeConfidentClientBinding();
    const factBundle = makeDocumentFactBundle();
    const handoff = evaluateReviewHandoff(classification, factBundle, true);
    const plan = buildActionPlanV3(classification, binding, factBundle, null, handoff);

    expect(plan.safetyFlags.some((f) => f.includes("AI_REVIEW_HANDOFF_RECOMMENDED"))).toBe(true);
  });

  it("downgrades to no_action_archive_only when handoff is ready", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const binding = makeConfidentClientBinding();
    const factBundle = makeDocumentFactBundle();
    const handoff = evaluateReviewHandoff(classification, factBundle, true);
    const plan = buildActionPlanV3(classification, binding, factBundle, null, handoff);

    expect(plan.outputMode).toBe("no_action_archive_only");
    // Should have an internal note action with handoff explanation
    expect(plan.recommendedActions.length).toBe(1);
    expect(plan.recommendedActions[0]!.params._reviewHandoffRecommended).toBe(true);
  });

  it("communication screenshot is NOT downgraded to handoff (lane separation)", () => {
    const classification = makeClassification("screenshot_client_communication", 0.9);
    const binding = makeConfidentClientBinding();
    const handoff = evaluateReviewHandoff(classification, emptyFactBundle(), true);
    const plan = buildActionPlanV3(classification, binding, emptyFactBundle(), null, handoff);

    expect(plan.outputMode).toBe("client_message_update");
    expect(plan.safetyFlags.every((f) => !f.includes("AI_REVIEW_HANDOFF"))).toBe(true);
  });

  it("no handoff recommendation → normal v2 plan", () => {
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const binding = makeConfidentClientBinding();
    const plan = buildActionPlanV3(classification, binding, emptyFactBundle(), null, null);

    expect(plan.outputMode).toBe("client_message_update");
    expect(plan.recommendedActions.length).toBeGreaterThan(0);
  });

  it("structured form facts: synthetic handoff does NOT downgrade CRM plan or add AI_REVIEW safety flag", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const binding = makeConfidentClientBinding();
    const factBundle = makeStructuredFormFactBundle();
    const syntheticHandoff: ReviewHandoffRecommendation = {
      recommended: true,
      signals: ["contract_like_document"],
      confidence: 0.75,
      orientationSummary: null,
      advisorExplanation: "Interní test handoff textu.",
      handoffReady: true,
    };
    const plan = buildActionPlanV3(classification, binding, factBundle, null, syntheticHandoff);

    expect(plan.outputMode).toBe("structured_image_fact_intake");
    expect(plan.safetyFlags.every((f) => !f.includes("AI_REVIEW_HANDOFF"))).toBe(true);
    expect(plan.recommendedActions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
  });
});

// ===========================================================================
// ROLLOUT FLAG STATE TESTS
// ===========================================================================

describe("rollout flag states", () => {
  it("getImageIntakeFlagSummary returns all four flag states", async () => {
    const { getImageIntakeFlagSummary } = await import("../image-intake/feature-flag");
    const summary = getImageIntakeFlagSummary();

    expect(summary).toHaveProperty("base");
    expect(summary).toHaveProperty("multimodal");
    expect(summary).toHaveProperty("stitching");
    expect(summary).toHaveProperty("review_handoff");
    expect(["enabled", "disabled"]).toContain(summary.base);
  });

  it("stitching flag OFF → computeStitchingGroups still works safely (used directly)", () => {
    // The orchestrator checks the flag before calling stitching
    // stitching.ts itself is flag-agnostic (pure function)
    // Use clearly different sizes to avoid near-duplicate detection
    const a = makeAsset({ contentHash: "flag-c1", sizeBytes: 200_000, width: 640, height: 480 });
    const b = makeAsset({ contentHash: "flag-c2", sizeBytes: 900_000, width: 1920, height: 1080 });
    const result = computeStitchingGroups([a, b], new Map());

    // No crash, returns valid standalone result
    expect(result.groups.length).toBe(2);
    expect(result.hasGroupedAssets).toBe(false);
  });
});

// ===========================================================================
// GOLDEN DATASET GUARDRAILS
// ===========================================================================

describe("golden dataset guardrails", () => {
  it("GD1: unrelated images must NOT be artificially merged (different types)", () => {
    const comm = makeAsset({ contentHash: "gd-c1", sizeBytes: 250_000, width: 720, height: 1280 });
    const bank = makeAsset({ contentHash: "gd-b1", sizeBytes: 800_000, width: 1440, height: 900 });
    const classMap = new Map([
      [comm.assetId, makeClassification("screenshot_client_communication")],
      [bank.assetId, makeClassification("screenshot_bank_or_finance_info")],
    ]);
    const result = computeStitchingGroups([comm, bank], classMap);

    const mergedGroup = result.groups.find((g) =>
      g.assetIds.includes(comm.assetId) && g.assetIds.includes(bank.assetId)
    );
    expect(mergedGroup).toBeUndefined();
  });

  it("GD2: duplicate images must NOT generate duplicate action proposals", () => {
    const a = makeAsset({ contentHash: "gd-dup" });
    const b = makeAsset({ contentHash: "gd-dup" });
    const result = computeStitchingGroups([a, b], new Map());
    const primaryIds = getPrimaryAssetIds(result);

    expect(primaryIds).toHaveLength(1);
  });

  it("GD3: review-like doc must NOT be silently processed as client_message_update", () => {
    const classification = makeClassification("photo_or_scan_document", 0.85);
    const binding = makeConfidentClientBinding();
    const factBundle = makeDocumentFactBundle();
    const handoff = evaluateReviewHandoff(classification, factBundle, true);
    const plan = buildActionPlanV3(classification, binding, factBundle, null, handoff);

    expect(plan.outputMode).not.toBe("client_message_update");
  });

  it("GD4: screenshot of communication must NOT fall into AI Review", () => {
    const classification = makeClassification("screenshot_client_communication", 0.9);
    const handoff = evaluateReviewHandoff(classification, emptyFactBundle(), true);

    expect(handoff.recommended).toBe(false);
    expect(handoff.handoffReady).toBe(false);
  });

  it("GD5: no confident case binding without active context or sufficient evidence", async () => {
    const result = await resolveCaseBindingV2(makeRequest(), null, null);
    expect(result.state).toBe("unresolved_case");
    expect(result.confidence).toBe(0.0);
  });

  it("GD6: multiple case candidates → no auto-pick", async () => {
    const mockDb = vi.mocked(db);
    (mockDb.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: "opp-1", title: "Case A" },
              { id: "opp-2", title: "Case B" },
              { id: "opp-3", title: "Case C" },
            ]),
          })),
        })),
      })),
    });

    const result = await resolveCaseBindingV2(makeRequest(), null, "client-xyz");
    expect(result.state).toBe("multiple_case_candidates");
    expect(result.caseId).toBeNull();
  });
});
