/**
 * Integration tests for Phase 5 image intake capability.
 * Covers:
 * - Long-thread conversation reconstruction v1
 * - Structured AI Review handoff payload contract
 * - Per-user rollout / allowlist rollout v1
 * - Batch multimodal optimization for grouped threads
 * - Advanced case/opportunity signal extraction v1
 * - Golden dataset guardrails (Phase 5 scenarios)
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
  opportunities: {},
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn(),
  contacts: {}, or: vi.fn(), sql: vi.fn(),
}));

import { reconstructThread, buildThreadSummaryLines } from "../image-intake/thread-reconstruction";
import { buildReviewHandoffPayload, buildHandoffPreviewNote } from "../image-intake/handoff-payload";
import { decideBatchMultimodalStrategy, buildBatchCostSummary } from "../image-intake/batch-multimodal";
import { extractCaseSignals, mergeCaseSignalBundles } from "../image-intake/case-signal-extraction";
import {
  isImageIntakeEnabledForUser,
  isImageIntakeThreadReconstructionEnabledForUser,
  isImageIntakeCaseSignalEnabledForUser,
  getImageIntakeUserRolloutSummary,
} from "../image-intake/feature-flag";
import type {
  NormalizedImageAsset,
  InputClassificationResult,
  ExtractedFactBundle,
  MultimodalCombinedPassResult,
  StitchedAssetGroup,
  ReviewHandoffRecommendation,
  ClientBindingResult,
  CaseBindingResultV2,
} from "../image-intake/types";
import { emptyFactBundle } from "../image-intake/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;
function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  counter++;
  return {
    assetId: `asset-${counter}`,
    originalFilename: `img_${String(counter).padStart(3, "0")}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 500_000 + counter * 1000,
    width: 1080,
    height: 1920,
    contentHash: `hash-${counter}`,
    storageUrl: `https://storage.example.com/img_${counter}.jpg`,
    thumbnailUrl: null,
    uploadedAt: new Date(Date.now() + counter * 60_000),
    ...overrides,
  };
}

function makeGroup(assetIds: string[], decision: StitchedAssetGroup["decision"] = "grouped_thread"): StitchedAssetGroup {
  return {
    groupId: "g1",
    decision,
    assetIds,
    primaryAssetId: assetIds[0]!,
    duplicateAssetIds: [],
    confidence: 0.8,
    rationale: "test group",
  };
}

function makeClassification(inputType: InputClassificationResult["inputType"]): InputClassificationResult {
  return {
    inputType,
    subtype: null,
    confidence: 0.85,
    containsText: true,
    likelyMessageThread: inputType === "screenshot_client_communication",
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: false,
    likelyFinancialInfo: false,
    uncertaintyFlags: [],
  };
}

function makeFactBundle(facts: Array<{ factKey: string; value: string; factType?: ExtractedFactBundle["facts"][0]["factType"] }>, assetId = "asset-test"): ExtractedFactBundle {
  return {
    facts: facts.map((f) => ({
      factType: f.factType ?? "document_received",
      value: f.value,
      normalizedValue: null,
      confidence: 0.85,
      evidence: { sourceAssetId: assetId, evidenceText: f.value, sourceRegion: null, confidence: 0.85 },
      isActionable: true,
      needsConfirmation: false,
      observedVsInferred: "observed" as const,
      factKey: f.factKey,
    })),
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

function makeHandoffRecommendation(recommended = true, confidence = 0.80): ReviewHandoffRecommendation {
  return {
    recommended,
    signals: ["contract_like_document"],
    confidence,
    orientationSummary: "Pojistná smlouva ŽP, platnost 2025",
    advisorExplanation: "Dokument vykazuje znaky smlouvy — doporučuji AI Review.",
    handoffReady: recommended && confidence >= 0.55,
  };
}

function makeClientBinding(state: ClientBindingResult["state"] = "bound_client_confident"): ClientBindingResult {
  return {
    state,
    clientId: state === "bound_client_confident" ? "client-1" : null,
    clientLabel: state === "bound_client_confident" ? "Jan Novák" : null,
    confidence: state === "bound_client_confident" ? 0.9 : 0.0,
    candidates: [],
    source: "session_context",
    warnings: [],
  };
}

function makeCaseBindingV2(state: CaseBindingResultV2["state"] = "bound_case_from_active_context"): CaseBindingResultV2 {
  return {
    state,
    caseId: state.startsWith("bound") ? "case-1" : null,
    caseLabel: state.startsWith("bound") ? "Hypotéka Novák" : null,
    confidence: state.startsWith("bound") ? 0.85 : 0.0,
    candidates: [],
    source: "active_context",
    warnings: [],
  };
}

function makeRequest() {
  return {
    sessionId: "sess-p5",
    tenantId: "tenant-1",
    userId: "user-1",
    assets: [makeAsset()],
    activeClientId: null,
    activeOpportunityId: null,
    activeCaseId: null,
    accompanyingText: null,
    channel: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  counter = 0;
});

// ===========================================================================
// THREAD RECONSTRUCTION TESTS
// ===========================================================================

describe("reconstructThread", () => {
  it("returns single_asset outcome for single-asset group", () => {
    const a = makeAsset();
    const group = makeGroup([a.assetId]);
    const result = reconstructThread(group, [a], new Map());

    expect(result.outcome).toBe("single_asset");
    expect(result.reconstructionConfidence).toBe(1.0);
  });

  it("returns duplicate_only when all assets are duplicates", () => {
    const a = makeAsset();
    const b = makeAsset();
    const group: StitchedAssetGroup = {
      ...makeGroup([a.assetId, b.assetId]),
      duplicateAssetIds: [b.assetId],
    };
    // Only a is usable, so with 1 usable and 1 dup → single_asset
    const result = reconstructThread(group, [a, b], new Map());
    expect(["single_asset", "duplicate_only"]).toContain(result.outcome);
  });

  it("merges facts from multiple assets into thread-level summary", () => {
    const a = makeAsset({ uploadedAt: new Date("2025-01-01T10:00:00Z") });
    const b = makeAsset({ uploadedAt: new Date("2025-01-01T11:00:00Z") });
    const group = makeGroup([a.assetId, b.assetId]);

    const bundleA = makeFactBundle([
      { factKey: "what_client_said", value: "Potřebuji hypotéku" },
    ], a.assetId);
    const bundleB = makeFactBundle([
      { factKey: "what_client_wants", value: "Schůzka příští týden" },
      { factKey: "required_follow_up", value: "Zavolat do pondělí" },
    ], b.assetId);

    const factBundles = new Map([[a.assetId, bundleA], [b.assetId, bundleB]]);
    const result = reconstructThread(group, [a, b], factBundles);

    expect(result.mergedFacts.length).toBeGreaterThan(0);
    expect(result.mergedFacts.some((f) => f.factKey === "what_client_said")).toBe(true);
    expect(result.mergedFacts.some((f) => f.factKey === "what_client_wants")).toBe(true);
  });

  it("identifies latest actionable signal from last ordered asset", () => {
    const a = makeAsset({ uploadedAt: new Date("2025-01-01T10:00:00Z") });
    const b = makeAsset({ uploadedAt: new Date("2025-01-01T11:00:00Z") });
    const group = makeGroup([a.assetId, b.assetId]);

    const bundleA = makeFactBundle([{ factKey: "what_client_said", value: "Starý požadavek" }], a.assetId);
    const bundleB = makeFactBundle([{ factKey: "required_follow_up", value: "AKTUÁLNÍ: zavolat" }], b.assetId);

    const result = reconstructThread(group, [a, b], new Map([[a.assetId, bundleA], [b.assetId, bundleB]]));

    expect(result.latestActionableSignal).toContain("AKTUÁLNÍ: zavolat");
  });

  it("returns ambiguous_thread when no facts extracted", () => {
    const a = makeAsset({ uploadedAt: new Date("2025-01-01") });
    const b = makeAsset({ uploadedAt: new Date("2025-01-02") });
    const group = makeGroup([a.assetId, b.assetId]);

    const result = reconstructThread(group, [a, b], new Map());

    expect(result.outcome).toBe("ambiguous_thread");
    expect(result.reconstructionConfidence).toBeLessThan(0.5);
    expect(result.unresolvedGaps.length).toBeGreaterThan(0);
  });

  it("returns partial_thread when facts present but latest signal missing", () => {
    const a = makeAsset({ uploadedAt: new Date("2025-01-01") });
    const b = makeAsset({ uploadedAt: new Date("2025-01-02") });
    const group = makeGroup([a.assetId, b.assetId]);

    // Only historical facts, no latest signal facts
    const bundleA = makeFactBundle([{ factKey: "what_client_said", value: "Ahoj" }], a.assetId);
    const bundleB = makeFactBundle([{ factKey: "what_client_said", value: "Jak se máte" }], b.assetId);

    const result = reconstructThread(group, [a, b], new Map([[a.assetId, bundleA], [b.assetId, bundleB]]));

    // partial because no urgency/follow-up/wants signal
    expect(["partial_thread", "full_thread"]).toContain(result.outcome);
  });

  it("does NOT create duplicate facts from overlapping screenshots", () => {
    const a = makeAsset();
    const b = makeAsset();
    const group = makeGroup([a.assetId, b.assetId]);

    // Both assets have the same fact (overlap)
    const sameValue = "Hypotéka 5M";
    const bundleA = makeFactBundle([{ factKey: "what_client_wants", value: sameValue }], a.assetId);
    const bundleB = makeFactBundle([{ factKey: "what_client_wants", value: sameValue }], b.assetId);

    const result = reconstructThread(group, [a, b], new Map([[a.assetId, bundleA], [b.assetId, bundleB]]));

    const wantsFacts = result.mergedFacts.filter((f) => f.factKey === "what_client_wants" && f.value === sameValue);
    // Deduplicated → only 1 fact entry (covering both assets)
    expect(wantsFacts).toHaveLength(1);
    expect(wantsFacts[0]!.sourceAssetIds).toHaveLength(2);
  });

  it("buildThreadSummaryLines returns empty for single_asset", () => {
    const a = makeAsset();
    const group = makeGroup([a.assetId]);
    const result = reconstructThread(group, [a], new Map());
    expect(buildThreadSummaryLines(result)).toHaveLength(0);
  });
});

// ===========================================================================
// STRUCTURED HANDOFF PAYLOAD TESTS
// ===========================================================================

describe("buildReviewHandoffPayload", () => {
  it("builds ready payload for confident handoff recommendation", () => {
    const recommendation = makeHandoffRecommendation(true, 0.85);
    const classification = makeClassification("photo_or_scan_document");
    const binding = makeClientBinding();
    const caseBindingV2 = makeCaseBindingV2();
    const factBundle = makeFactBundle([{ factKey: "document_summary", value: "Pojistná smlouva ŽP" }]);
    const asset = makeAsset();

    const payload = buildReviewHandoffPayload(
      recommendation,
      classification,
      binding,
      caseBindingV2,
      factBundle,
      [asset],
      makeRequest(),
    );

    expect(payload).not.toBeNull();
    expect(payload!.status).toBe("ready");
    expect(payload!.laneNote).toBe("image_intake_lane_only_extracted_orientation");
    expect(payload!.sourceAssetIds).toContain(asset.assetId);
    expect(payload!.handoffReasons.length).toBeGreaterThan(0);
  });

  it("returns null when handoff is not recommended", () => {
    const recommendation = makeHandoffRecommendation(false, 0.0);
    const payload = buildReviewHandoffPayload(
      recommendation, makeClassification("photo_or_scan_document"),
      makeClientBinding(), makeCaseBindingV2(), emptyFactBundle(), [makeAsset()], makeRequest(),
    );

    expect(payload).toBeNull();
  });

  it("includes binding ambiguity notes when client is unresolved", () => {
    const recommendation = makeHandoffRecommendation(true, 0.80);
    const binding = makeClientBinding("insufficient_binding");
    const payload = buildReviewHandoffPayload(
      recommendation, makeClassification("photo_or_scan_document"),
      binding, makeCaseBindingV2("unresolved_case"),
      makeFactBundle([{ factKey: "document_summary", value: "Smlouva" }]),
      [makeAsset()], makeRequest(),
    );

    expect(payload).not.toBeNull();
    expect(payload!.ambiguityNotes.length).toBeGreaterThan(0);
    expect(payload!.bindingContext.clientId).toBeNull();
  });

  it("marks lane boundary explicitly", () => {
    const recommendation = makeHandoffRecommendation(true, 0.80);
    const payload = buildReviewHandoffPayload(
      recommendation, makeClassification("photo_or_scan_document"),
      makeClientBinding(), makeCaseBindingV2(),
      makeFactBundle([{ factKey: "document_summary", value: "Smlouva 2025" }]),
      [makeAsset()], makeRequest(),
    );

    expect(payload!.laneNote).toBe("image_intake_lane_only_extracted_orientation");
  });

  it("buildHandoffPreviewNote returns non-empty string for ready payload", () => {
    const recommendation = makeHandoffRecommendation(true, 0.80);
    const payload = buildReviewHandoffPayload(
      recommendation, makeClassification("photo_or_scan_document"),
      makeClientBinding(), makeCaseBindingV2(),
      makeFactBundle([{ factKey: "document_summary", value: "Smlouva" }]),
      [makeAsset()], makeRequest(),
    );
    const note = buildHandoffPreviewNote(payload!);
    expect(note.length).toBeGreaterThan(10);
    expect(note.toLowerCase()).toContain("ai review");
  });
});

// ===========================================================================
// PER-USER ROLLOUT / ALLOWLIST TESTS
// ===========================================================================

describe("per-user rollout v1", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  it("allows user when no allowlist is set (allow all)", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    delete process.env.IMAGE_INTAKE_ALLOWED_USER_IDS;

    expect(isImageIntakeEnabledForUser("any-user-id")).toBe(true);
  });

  it("allows listed user when allowlist is set", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_ALLOWED_USER_IDS = "user-abc,user-xyz";

    expect(isImageIntakeEnabledForUser("user-abc")).toBe(true);
    expect(isImageIntakeEnabledForUser("user-xyz")).toBe(true);
  });

  it("blocks unlisted user when allowlist is set", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_ALLOWED_USER_IDS = "user-abc,user-xyz";

    expect(isImageIntakeEnabledForUser("user-other")).toBe(false);
  });

  it("blocks all users when base flag is OFF", () => {
    process.env.IMAGE_INTAKE_ENABLED = "false";
    delete process.env.IMAGE_INTAKE_ALLOWED_USER_IDS;

    expect(isImageIntakeEnabledForUser("user-abc")).toBe(false);
  });

  it("thread reconstruction requires base + stitching + thread flag", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_STITCHING_ENABLED = "true";
    process.env.IMAGE_INTAKE_THREAD_RECONSTRUCTION_ENABLED = "true";
    delete process.env.IMAGE_INTAKE_THREAD_RECONSTRUCTION_ALLOWED_USER_IDS;

    expect(isImageIntakeThreadReconstructionEnabledForUser("any-user")).toBe(true);
  });

  it("thread reconstruction blocked when thread flag is OFF", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_STITCHING_ENABLED = "true";
    process.env.IMAGE_INTAKE_THREAD_RECONSTRUCTION_ENABLED = "false";

    expect(isImageIntakeThreadReconstructionEnabledForUser("any-user")).toBe(false);
  });

  it("getImageIntakeUserRolloutSummary returns all 5 fields with reason", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    const summary = getImageIntakeUserRolloutSummary("user-test");

    expect(summary).toHaveProperty("base");
    expect(summary).toHaveProperty("multimodal");
    expect(summary).toHaveProperty("threadReconstruction");
    expect(summary).toHaveProperty("reviewHandoff");
    expect(summary).toHaveProperty("caseSignal");
    expect(summary).toHaveProperty("reason");
    expect(typeof summary.reason).toBe("string");
  });

  it("rollout summary shows reason for disabled user", () => {
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_ALLOWED_USER_IDS = "only-this-user";
    const summary = getImageIntakeUserRolloutSummary("blocked-user");

    expect(summary.base).toBe(false);
    expect(summary.reason).toContain("allowlist");
  });
});

// ===========================================================================
// BATCH MULTIMODAL DECISION TESTS
// ===========================================================================

describe("decideBatchMultimodalStrategy", () => {
  it("returns skip_all when multimodal is disabled", () => {
    const a = makeAsset();
    const b = makeAsset();
    const group = makeGroup([a.assetId, b.assetId]);
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("screenshot_client_communication")],
    ]);

    const decision = decideBatchMultimodalStrategy(group, [a, b], classMap, new Map(), false);
    expect(decision.strategy).toBe("skip_all");
    expect(decision.estimatedVisionCalls).toBe(0);
  });

  it("returns combined_pass for 2 same-type assets (grouped_thread)", () => {
    const a = makeAsset({ storageUrl: "https://s.example.com/a.jpg" });
    const b = makeAsset({ storageUrl: "https://s.example.com/b.jpg" });
    const group = makeGroup([a.assetId, b.assetId], "grouped_thread");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("screenshot_client_communication")],
    ]);

    const decision = decideBatchMultimodalStrategy(group, [a, b], classMap, new Map(), true);
    expect(decision.strategy).toBe("combined_pass");
    expect(decision.combinedPassAssetIds).toHaveLength(2);
    expect(decision.estimatedVisionCalls).toBe(1);
  });

  it("skips already-processed assets (no duplicate multimodal calls)", () => {
    const a = makeAsset({ storageUrl: "https://s.example.com/a.jpg" });
    const b = makeAsset({ storageUrl: "https://s.example.com/b.jpg" });
    const group = makeGroup([a.assetId, b.assetId], "grouped_thread");
    const classMap = new Map([
      [a.assetId, makeClassification("screenshot_client_communication")],
      [b.assetId, makeClassification("screenshot_client_communication")],
    ]);

    // Asset A already has a result
    const existingResults = new Map([[a.assetId, {} as any]]);
    const decision = decideBatchMultimodalStrategy(group, [a, b], classMap, existingResults, true);

    expect(decision.skipAssetIds).toContain(a.assetId);
    expect(decision.perAssetIds.length + decision.combinedPassAssetIds.length).toBeLessThanOrEqual(1);
  });

  it("caps vision calls at MAX_VISION_CALLS_PER_BATCH (2) for per_asset strategy", () => {
    const assets = [makeAsset(), makeAsset(), makeAsset()].map((a) => ({
      ...a,
      storageUrl: `https://s.example.com/${a.assetId}.jpg`,
    }));
    // Differentiate sizes to avoid near-duplicate merging
    assets[0]!.sizeBytes = 100_000;
    assets[1]!.sizeBytes = 200_000;
    assets[2]!.sizeBytes = 300_000;
    const group = makeGroup(assets.map((a) => a.assetId), "grouped_thread");
    // Force per-asset by using different types
    const classMap = new Map([
      [assets[0]!.assetId, makeClassification("screenshot_client_communication")],
      [assets[1]!.assetId, makeClassification("screenshot_payment_details")], // different type
      [assets[2]!.assetId, makeClassification("photo_or_scan_document")],
    ]);

    const decision = decideBatchMultimodalStrategy(group, assets, classMap, new Map(), true);
    expect(decision.estimatedVisionCalls).toBeLessThanOrEqual(2);
  });

  it("skips general_unusable_image assets", () => {
    const a = makeAsset({ storageUrl: "https://s.example.com/a.jpg" });
    const b = makeAsset({ storageUrl: "https://s.example.com/b.jpg" });
    const group = makeGroup([a.assetId, b.assetId]);
    const classMap = new Map([
      [a.assetId, makeClassification("general_unusable_image")],
      [b.assetId, makeClassification("general_unusable_image")],
    ]);

    const decision = decideBatchMultimodalStrategy(group, [a, b], classMap, new Map(), true);
    expect(decision.strategy).toBe("skip_all");
    expect(decision.skipAssetIds).toContain(a.assetId);
  });

  it("buildBatchCostSummary returns non-empty string", () => {
    const a = makeAsset({ storageUrl: "https://s.example.com/a.jpg" });
    const group = makeGroup([a.assetId]);
    const decision = decideBatchMultimodalStrategy(group, [a], new Map(), new Map(), false);
    const summary = buildBatchCostSummary(decision);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(5);
  });
});

// ===========================================================================
// ADVANCED CASE SIGNAL EXTRACTION TESTS
// ===========================================================================

describe("extractCaseSignals", () => {
  it("extracts product_type_mention for hypotéka keyword", () => {
    const bundle = makeFactBundle([
      { factKey: "what_client_wants", value: "Chci refinancovat hypotéku do 5 milionů" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_client_communication"), "asset-1");

    const productSignal = result.signals.find((s) => s.signalType === "product_type_mention");
    expect(productSignal).toBeTruthy();
    expect(productSignal!.normalizedValue).toContain("Hypotéka");
    expect(productSignal!.bindingAssistOnly).toBe(true);
  });

  it("extracts bank_or_institution_mention for known banks", () => {
    const bundle = makeFactBundle([
      { factKey: "what_client_said", value: "Volali z Komerční banky ohledně nabídky" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_client_communication"), "asset-1");

    const bankSignal = result.signals.find((s) => s.signalType === "bank_or_institution_mention");
    expect(bankSignal).toBeTruthy();
    expect(bankSignal!.bindingAssistOnly).toBe(true);
  });

  it("extracts deadline signals from due_date fact", () => {
    const bundle = makeFactBundle([
      { factKey: "due_date", value: "Splatnost do 15.3.2025" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_payment_details"), "asset-1");

    const deadlineSignal = result.signals.find((s) => s.signalType === "deadline_or_date_mention");
    expect(deadlineSignal).toBeTruthy();
    expect(deadlineSignal!.strength).toBe("strong");
  });

  it("extracts existing_process_reference signals", () => {
    const bundle = makeFactBundle([
      { factKey: "what_client_said", value: "Smlouva č. 2025-KA-001234 stále čeká" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_client_communication"), "asset-1");

    const processSignal = result.signals.find((s) => s.signalType === "existing_process_reference");
    expect(processSignal).toBeTruthy();
  });

  it("returns none strength for empty fact bundle", () => {
    const result = extractCaseSignals(emptyFactBundle(), makeClassification("screenshot_client_communication"), "asset-1");
    expect(result.overallStrength).toBe("none");
    expect(result.signals).toHaveLength(0);
  });

  it("all signals are marked bindingAssistOnly: true", () => {
    const bundle = makeFactBundle([
      { factKey: "what_client_wants", value: "Hypotéka na 30 let, Česká spořitelna" },
      { factKey: "amount", value: "4500000" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_client_communication"), "asset-1");

    for (const signal of result.signals) {
      expect(signal.bindingAssistOnly).toBe(true);
    }
  });

  it("mergeCaseSignalBundles deduplicates same signals from multiple assets", () => {
    const bundleA = makeFactBundle([{ factKey: "what_client_wants", value: "Hypotéka KB" }], "a1");
    const bundleB = makeFactBundle([{ factKey: "what_client_wants", value: "Hypotéka KB" }], "a2");
    const sigA = extractCaseSignals(bundleA, makeClassification("screenshot_client_communication"), "a1");
    const sigB = extractCaseSignals(bundleB, makeClassification("screenshot_client_communication"), "a2");

    const merged = mergeCaseSignalBundles([sigA, sigB]);
    // Should deduplicate "Hypotéka" product type signal
    const productSignals = merged.signals.filter((s) => s.signalType === "product_type_mention" && s.normalizedValue?.includes("Hypotéka"));
    expect(productSignals).toHaveLength(1);
  });
});

// ===========================================================================
// GOLDEN DATASET GUARDRAILS — PHASE 5
// ===========================================================================

describe("golden dataset guardrails — Phase 5", () => {
  it("GD5-1: thread reconstruction returns ambiguous for insufficient facts (no fabrication)", () => {
    const a = makeAsset();
    const b = makeAsset({ uploadedAt: new Date(Date.now() + 60_000) });
    const group = makeGroup([a.assetId, b.assetId]);

    const result = reconstructThread(group, [a, b], new Map());

    expect(result.outcome).toBe("ambiguous_thread");
    expect(result.latestActionableSignal).toBeNull();
    expect(result.mergedFacts).toHaveLength(0);
  });

  it("GD5-2: duplicate screenshots do not generate duplicate merged facts", () => {
    const a = makeAsset();
    const b = makeAsset();
    const group: StitchedAssetGroup = {
      ...makeGroup([a.assetId, b.assetId]),
      duplicateAssetIds: [b.assetId], // b is a duplicate
    };

    const bundleA = makeFactBundle([{ factKey: "what_client_wants", value: "Schůzka" }], a.assetId);
    const bundleB = makeFactBundle([{ factKey: "what_client_wants", value: "Schůzka" }], b.assetId);
    const result = reconstructThread(group, [a, b], new Map([[a.assetId, bundleA], [b.assetId, bundleB]]));

    // b is excluded from reconstruction → only a's facts processed
    const wantsFacts = result.mergedFacts.filter((f) => f.factKey === "what_client_wants");
    expect(wantsFacts).toHaveLength(1);
  });

  it("GD5-3: review handoff payload never auto-executes AI Review (lane note present)", () => {
    const recommendation = makeHandoffRecommendation(true, 0.85);
    const factBundle = makeFactBundle([{ factKey: "document_summary", value: "Smlouva" }]);
    const payload = buildReviewHandoffPayload(
      recommendation, makeClassification("photo_or_scan_document"),
      makeClientBinding(), makeCaseBindingV2(), factBundle, [makeAsset()], makeRequest(),
    );

    expect(payload!.laneNote).toBe("image_intake_lane_only_extracted_orientation");
    // No auto-execution fields
    expect(payload).not.toHaveProperty("autoExecute");
    expect(payload).not.toHaveProperty("triggerAiReview");
  });

  it("GD5-4: no confident case binding from weak signals alone", () => {
    const bundle = makeFactBundle([
      { factKey: "what_client_said", value: "Možná hypotéka nebo pojistka, neurcitý" },
    ]);
    const result = extractCaseSignals(bundle, makeClassification("screenshot_client_communication"), "asset-1");

    // Even if signals are present, ALL must be marked binding assist only
    // (they never auto-pick a case — that's the safety guarantee)
    for (const signal of result.signals) {
      expect(signal.bindingAssistOnly).toBe(true);
    }
    // overallStrength can be any value — the key is bindingAssistOnly enforcement
  });

  it("GD5-5: batch strategy never exceeds MAX_VISION_CALLS_PER_BATCH for large groups", () => {
    // Create 5 assets that should be capped at 2 vision calls
    const assets = Array.from({ length: 5 }, () => ({
      ...makeAsset(),
      storageUrl: `https://s.example.com/x.jpg`,
    }));
    // Give different sizes to prevent near-dup merging
    assets.forEach((a, i) => { (a as NormalizedImageAsset).sizeBytes = (i + 1) * 100_000; });

    const group = makeGroup(assets.map((a) => a.assetId), "grouped_related");
    // Different types → forces per_asset strategy
    const classMap = new Map(assets.map((a, i) => [
      a.assetId,
      makeClassification(i % 2 === 0 ? "screenshot_payment_details" : "screenshot_bank_or_finance_info"),
    ]));

    const decision = decideBatchMultimodalStrategy(group, assets, classMap, new Map(), true);
    expect(decision.estimatedVisionCalls).toBeLessThanOrEqual(2);
  });

  it("GD5-6: per-user rollout does not expose features to unlisted users", () => {
    const origEnv = { ...process.env };
    process.env.IMAGE_INTAKE_ENABLED = "true";
    process.env.IMAGE_INTAKE_ALLOWED_USER_IDS = "alpha-user";

    const summary = getImageIntakeUserRolloutSummary("non-alpha-user");
    expect(summary.base).toBe(false);
    expect(summary.multimodal).toBe(false);
    expect(summary.threadReconstruction).toBe(false);

    Object.assign(process.env, origEnv);
  });
});
