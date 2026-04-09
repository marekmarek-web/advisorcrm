/**
 * Image Intake Phase 2: classifier tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn(),
  createResponseSafe: vi.fn(),
  createResponseStructuredWithImage: vi.fn(),
  logOpenAICall: vi.fn(),
}));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({ db: {}, contacts: {}, eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), desc: vi.fn() }));

import { createResponseStructured } from "@/lib/openai";
import { classifyImageInput, classifyBatch } from "../image-intake/classifier";
import type { NormalizedImageAsset } from "../image-intake/types";

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  return {
    assetId: `asset-${Math.random().toString(36).slice(2, 8)}`,
    // Use neutral name that triggers no deterministic hint — model layer tests need this
    originalFilename: "attachment_00001.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 500_000,
    width: 1024,
    height: 768,
    contentHash: null,
    storageUrl: "https://storage.example.com/img.jpg",
    thumbnailUrl: null,
    uploadedAt: new Date(),
    ...overrides,
  };
}

function mockModel(inputType: string, confidence = 0.85) {
  vi.mocked(createResponseStructured).mockResolvedValueOnce({
    text: "{}",
    parsed: {
      inputType,
      confidence,
      rationale: "test",
      needsDeepExtraction: true,
      safePreviewAlready: false,
    },
    model: "gpt-5-mini",
  });
}

describe("classifyImageInput — deterministic (Layer 1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("classifies WhatsApp filename without model call", async () => {
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "WhatsApp Image 2025-01-01.jpg" }),
      null,
    );
    expect(result.result.inputType).toBe("screenshot_client_communication");
    expect(result.usedModel).toBe(false);
  });

  it("classifies tiny image as unusable with early exit, no model call", async () => {
    const result = await classifyImageInput(
      makeAsset({ width: 40, height: 30, originalFilename: "tiny.jpg" }),
      null,
    );
    expect(result.result.inputType).toBe("general_unusable_image");
    expect(result.usedModel).toBe(false);
    expect(result.earlyExit).toBe(true);
    expect(createResponseStructured).not.toHaveBeenCalled();
  });

  it("classifies payment filename without model call", async () => {
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "platba-qr.png" }),
      "platební údaje",
    );
    // both filename and text hint match → payment, no model call
    expect(result.result.inputType).toBe("screenshot_payment_details");
    expect(result.usedModel).toBe(false);
  });

  it("classifies bank transaction from text hint alone", async () => {
    mockModel("screenshot_bank_or_finance_info", 0.8);
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "IMG_001.jpg" }),
      "stav účtu a transakce",
    );
    // text hint → bank, but no filename hint → uses model for confirmation
    expect(result.result.inputType).toBe("screenshot_bank_or_finance_info");
  });

  it("does not force CRM document lane for loose field-only wording", async () => {
    mockModel("mixed_or_uncertain_image", 0.45);
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "neutral_attach.jpg" }),
      "doplň rodné číslo",
    );
    expect(result.result.inputType).not.toBe("photo_or_scan_document");
  });
});

describe("classifyImageInput — model layer (Layer 2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls model when no deterministic signal", async () => {
    mockModel("supporting_reference_image", 0.75);
    // Neutral filename — no hint, forces model layer
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "neutral_2025.jpg" }),
      null,
    );
    expect(createResponseStructured).toHaveBeenCalledOnce();
    expect(result.result.inputType).toBe("supporting_reference_image");
    expect(result.usedModel).toBe(true);
  });

  it("falls back to mixed_or_uncertain when model fails", async () => {
    vi.mocked(createResponseStructured).mockRejectedValueOnce(new Error("API error"));
    // Neutral filename — forces model layer (which then rejects)
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "neutral_unknown.jpg" }),
      null,
    );
    expect(result.result.inputType).toBe("mixed_or_uncertain_image");
    expect(result.result.confidence).toBe(0.0);
    expect(result.usedModel).toBe(true);
  });

  it("falls back when model returns invalid enum value", async () => {
    vi.mocked(createResponseStructured).mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "invalid_type_xyz",
        confidence: 0.9,
        rationale: "test",
        needsDeepExtraction: false,
        safePreviewAlready: false,
      },
      model: "gpt-5-mini",
    });
    // Neutral filename — no deterministic hint, forces model layer
    const result = await classifyImageInput(
      makeAsset({ originalFilename: "unknown_neutral.jpg" }),
      null,
    );
    expect(result.result.inputType).toBe("mixed_or_uncertain_image");
    expect(result.result.confidence).toBe(0.0);
  });

  it("returns valid taxonomy enum from model output", async () => {
    mockModel("photo_or_scan_document", 0.82);
    const result = await classifyImageInput(makeAsset(), null);
    const validTypes = [
      "screenshot_client_communication",
      "photo_or_scan_document",
      "screenshot_payment_details",
      "screenshot_bank_or_finance_info",
      "supporting_reference_image",
      "general_unusable_image",
      "mixed_or_uncertain_image",
    ];
    expect(validTypes).toContain(result.result.inputType);
  });

  it("clamps confidence to 0-1 range", async () => {
    vi.mocked(createResponseStructured).mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "photo_or_scan_document",
        confidence: 1.5,
        rationale: "test",
        needsDeepExtraction: false,
        safePreviewAlready: false,
      },
      model: "gpt-5-mini",
    });
    const result = await classifyImageInput(makeAsset(), null);
    expect(result.result.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe("classifyBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns unusable for empty array", async () => {
    const result = await classifyBatch([], null);
    expect(result.result.inputType).toBe("general_unusable_image");
    expect(result.earlyExit).toBe(true);
    expect(createResponseStructured).not.toHaveBeenCalled();
  });

  it("classifies primary asset when batch has content", async () => {
    mockModel("screenshot_client_communication", 0.88);
    const result = await classifyBatch([makeAsset(), makeAsset()], null);
    expect(result.result.inputType).toBe("screenshot_client_communication");
  });
});
