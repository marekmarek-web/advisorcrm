/**
 * Image Intake Phase 1: preflight validation tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseStructured: vi.fn(), createResponseSafe: vi.fn(), createResponseStructuredWithImage: vi.fn(), logOpenAICall: vi.fn() }));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({ db: {}, contacts: {}, eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), desc: vi.fn() }));
import {
  runImagePreflight,
  runBatchPreflight,
  purgePreflightCache,
} from "../image-intake";
import type { NormalizedImageAsset } from "../image-intake";

const SESSION = "sess-preflight-test";

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  return {
    assetId: `asset-${Math.random().toString(36).slice(2, 8)}`,
    originalFilename: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 500_000,
    width: 1024,
    height: 768,
    contentHash: null,
    storageUrl: null,
    thumbnailUrl: null,
    uploadedAt: new Date(),
    ...overrides,
  };
}

describe("runImagePreflight", () => {
  beforeEach(() => {
    purgePreflightCache(SESSION);
  });

  it("accepts a valid JPEG image", () => {
    const result = runImagePreflight(makeAsset(), SESSION);
    expect(result.eligible).toBe(true);
    expect(result.mimeSupported).toBe(true);
    expect(result.sizeWithinLimits).toBe(true);
    expect(result.rejectReason).toBeNull();
    expect(result.qualityLevel).toBe("good");
  });

  it("rejects unsupported MIME type", () => {
    const result = runImagePreflight(makeAsset({ mimeType: "application/pdf" }), SESSION);
    expect(result.eligible).toBe(false);
    expect(result.mimeSupported).toBe(false);
    expect(result.rejectReason).toBe("unsupported_mime");
  });

  it("rejects file exceeding size limit", () => {
    const result = runImagePreflight(
      makeAsset({ sizeBytes: 25 * 1024 * 1024 }),
      SESSION,
    );
    expect(result.eligible).toBe(false);
    expect(result.sizeWithinLimits).toBe(false);
    expect(result.rejectReason).toBe("file_too_large");
  });

  it("flags unusable quality for tiny images", () => {
    const result = runImagePreflight(
      makeAsset({ width: 50, height: 50 }),
      SESSION,
    );
    expect(result.eligible).toBe(false);
    expect(result.qualityLevel).toBe("unusable");
    expect(result.rejectReason).toBe("unusable_quality");
  });

  it("accepts poor quality but does not reject", () => {
    const result = runImagePreflight(
      makeAsset({ width: 200, height: 200 }),
      SESSION,
    );
    expect(result.eligible).toBe(true);
    expect(result.qualityLevel).toBe("poor");
  });

  it("detects duplicate by content hash", () => {
    const asset = makeAsset({ contentHash: "abc123" });
    const first = runImagePreflight(asset, SESSION);
    expect(first.isDuplicate).toBe(false);

    const second = runImagePreflight(makeAsset({ contentHash: "abc123" }), SESSION);
    expect(second.isDuplicate).toBe(true);
    expect(second.warnings.some((w) => w.includes("již zpracován"))).toBe(true);
  });

  it("does not flag duplicate without content hash", () => {
    runImagePreflight(makeAsset({ contentHash: null }), SESSION);
    const second = runImagePreflight(makeAsset({ contentHash: null }), SESSION);
    expect(second.isDuplicate).toBe(false);
  });

  it("returns acceptable quality when dimensions unknown", () => {
    const result = runImagePreflight(
      makeAsset({ width: null, height: null }),
      SESSION,
    );
    expect(result.qualityLevel).toBe("acceptable");
    expect(result.eligible).toBe(true);
  });
});

describe("runBatchPreflight", () => {
  beforeEach(() => {
    purgePreflightCache(SESSION);
  });

  it("returns not eligible for empty array", () => {
    const result = runBatchPreflight([], SESSION);
    expect(result.eligible).toBe(false);
    expect(result.batchWarnings.length).toBeGreaterThan(0);
  });

  it("caps at MAX_IMAGES_PER_INTAKE", () => {
    const assets = Array.from({ length: 15 }, () => makeAsset());
    const result = runBatchPreflight(assets, SESSION);
    expect(result.assetResults.length).toBe(10);
    expect(result.batchWarnings.some((w) => w.includes("Maximální počet"))).toBe(true);
  });

  it("is eligible if at least one asset passes", () => {
    const assets = [
      makeAsset({ mimeType: "application/pdf" }),
      makeAsset(),
    ];
    const result = runBatchPreflight(assets, SESSION);
    expect(result.eligible).toBe(true);
    expect(result.assetResults[0].result.eligible).toBe(false);
    expect(result.assetResults[1].result.eligible).toBe(true);
  });
});
