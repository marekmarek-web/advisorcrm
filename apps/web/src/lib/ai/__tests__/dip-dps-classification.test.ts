/**
 * DIP/DPS top-level classification + Prompt Builder productionization — regression tests
 *
 * Coverage:
 * DC01: pure DIP text → product family override returns "dip"
 * DC02: pure DPS text → product family override returns "dps"
 * DC03: PP (penzijní připojištění) text → product family override returns "pp"
 * DC04: life_insurance text → no override (stays life_insurance)
 * DC05: investment_service_agreement text → no override (not overridable family)
 * DC06: empty text → no override
 * DC07: family already "dip" → no override (correct, no change)
 * DC08: family "dps" already set → no override
 * DC09: IŽP with investment → NOT overridden (should stay life_insurance)
 * DC10: prompt registry includes healthSectionExtraction
 * DC11: prompt registry includes investmentSectionExtraction
 * DC12: healthSectionExtraction env key is correct string
 * DC13: investmentSectionExtraction env key is correct string
 * DC14: health section extraction falls back when no promptId configured
 * DC15: investment section extraction falls back when no promptId configured
 * DC16: publishHints not weakened after DIP/DPS classification
 * DC17: routing for "dip" family → dipExtraction prompt key
 * DC18: routing for "dps" family → retirementProductExtraction prompt key
 * DC19: routing for "pp" family → retirementProductExtraction prompt key
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock openai + prompt ID env (must be before imports that read env) ─────────
const mockLLMResponse = vi.fn();

vi.mock("@/lib/openai", () => ({
  createResponseStructured: (...args: unknown[]) => mockLLMResponse(...args),
  createResponse: vi.fn(),
  createAiReviewResponseFromPrompt: vi.fn().mockResolvedValue({ ok: true, text: '{"investmentSectionPresent":false,"productType":"unknown"}' }),
  logOpenAICall: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/observability/portal-sentry", () => ({ capturePublishGuardFailure: vi.fn() }));

// ── Imports ───────────────────────────────────────────────────────────────────
import {
  applyProductFamilyTextOverride,
} from "@/lib/ai/document-classification-overrides";
import {
  resolveAiReviewExtractionRoute,
} from "@/lib/ai/ai-review-extraction-router";
import {
  AI_REVIEW_PROMPT_KEYS,
  AI_REVIEW_REGISTRY,
  getAiReviewPromptId,
} from "@/lib/ai/prompt-model-registry";
import type { PacketMeta } from "@/lib/ai/document-packet-types";
import type { DocumentReviewEnvelope } from "@/lib/ai/document-review-types";
import { orchestrateSubdocumentExtraction } from "@/lib/ai/subdocument-extraction-orchestrator";

// ─── Text fixtures ────────────────────────────────────────────────────────────

const DIP_TEXT = `
Smlouva o Dlouhodobém investičním produktu (DIP)
DIP účet č. 2024-001

Majitel účtu DIP: Jan Novák
Smlouva o DIP uzavřena v souladu se zákonem.
`.trim().padEnd(300, " ");

const DPS_TEXT = `
Doplňkové penzijní spoření
Účastnická smlouva DPS

Penzijní společnost: Conseq
Penzijní fond: Konzervativní DPS
Klient: Jana Nováková
`.trim().padEnd(300, " ");

const PP_TEXT = `
Smlouva o penzijním připojištění

Penzijní fond: Allianz penzijní fond
Státní příspěvek na penzijní připojištění: ano
Pojistník: Petr Svoboda
`.trim().padEnd(300, " ");

const LIFE_INSURANCE_TEXT = `
Pojistná smlouva č. POL-55555

Pojistitel: Česká pojišťovna
Pojistník: Jan Novák, nar. 1.1.1980
Produkt: FORTE životní pojištění
Číslo pojistné smlouvy: POL-55555
`.trim().padEnd(300, " ");

const IZP_INVESTMENT_TEXT = `
Pojistná smlouva FLEXI INVEST č. POL-99111

Pojistitel: Kooperativa pojišťovna
Pojistník: Jana Nováková
Produkt: Investiční životní pojištění

Investiční strategie: Vyvážená
Investiční fondy: 60% Fond A, 40% Fond B
`.trim().padEnd(300, " ");

// ─── DC01–DC09: Product family override ──────────────────────────────────────

describe("applyProductFamilyTextOverride", () => {
  it("DC01: pure DIP text → family overridden to dip", () => {
    const result = applyProductFamilyTextOverride("life_insurance", DIP_TEXT);
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("dip");
    expect(result.overrideReason).toBe("dip_keywords");
  });

  it("DC02: pure DPS text → family overridden to dps", () => {
    const result = applyProductFamilyTextOverride("life_insurance", DPS_TEXT);
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("dps");
    expect(result.overrideReason).toBe("dps_keywords");
  });

  it("DC03: penzijní připojištění text → family overridden to pp", () => {
    const result = applyProductFamilyTextOverride("life_insurance", PP_TEXT);
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("pp");
    expect(result.overrideReason).toBe("pp_pension_keywords");
  });

  it("DC04: life insurance text → no override, stays life_insurance", () => {
    const result = applyProductFamilyTextOverride("life_insurance", LIFE_INSURANCE_TEXT);
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("life_insurance");
  });

  it("DC05: family already investment → not overridable", () => {
    // investment_service_agreement is not in overridable families → no override
    const result = applyProductFamilyTextOverride("investment", DIP_TEXT);
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("investment");
  });

  it("DC06: empty text → no override", () => {
    const result = applyProductFamilyTextOverride("life_insurance", "");
    expect(result.overrideApplied).toBe(false);
  });

  it("DC07: family already dip → not overridden (already correct)", () => {
    // Already-correct families are not in overridable set → no override
    const result = applyProductFamilyTextOverride("dip", DIP_TEXT);
    expect(result.overrideApplied).toBe(false);
  });

  it("DC08: family already dps → not overridden", () => {
    const result = applyProductFamilyTextOverride("dps", DPS_TEXT);
    expect(result.overrideApplied).toBe(false);
  });

  it("DC09: IŽP with investment keywords → stays life_insurance (not enough DIP/DPS signals)", () => {
    // IŽP text has investiční but NOT DIP/DPS-specific markers → no override
    const result = applyProductFamilyTextOverride("life_insurance", IZP_INVESTMENT_TEXT);
    // Should NOT be overridden — life insurance with investment is still life_insurance
    expect(result.productFamily).toBe("life_insurance");
    // Either no override or override should not turn it into dip/dps/pp
    if (result.overrideApplied) {
      expect(["dip", "dps", "pp"]).not.toContain(result.productFamily);
    }
  });
});

// ─── DC10–DC13: Prompt registry contains new keys ────────────────────────────

describe("prompt registry — section extraction keys", () => {
  it("DC10: AI_REVIEW_PROMPT_KEYS contains healthSectionExtraction", () => {
    expect(AI_REVIEW_PROMPT_KEYS).toContain("healthSectionExtraction");
  });

  it("DC11: AI_REVIEW_PROMPT_KEYS contains investmentSectionExtraction", () => {
    expect(AI_REVIEW_PROMPT_KEYS).toContain("investmentSectionExtraction");
  });

  it("DC12: healthSectionExtraction registry entry has correct env key", () => {
    const entry = AI_REVIEW_REGISTRY.healthSectionExtraction;
    expect(entry).toBeTruthy();
    expect(entry.envKey).toBe("OPENAI_PROMPT_AI_REVIEW_HEALTH_SECTION_EXTRACTION_ID");
    expect(entry.category).toBe("ai_review");
  });

  it("DC13: investmentSectionExtraction registry entry has correct env key", () => {
    const entry = AI_REVIEW_REGISTRY.investmentSectionExtraction;
    expect(entry).toBeTruthy();
    expect(entry.envKey).toBe("OPENAI_PROMPT_AI_REVIEW_INVESTMENT_SECTION_EXTRACTION_ID");
    expect(entry.category).toBe("ai_review");
  });
});

// ─── DC14–DC15: Prompt Builder fallback ──────────────────────────────────────

describe("section extraction prompt fallback", () => {
  beforeEach(() => {
    mockLLMResponse.mockReset();
  });

  it("DC14: health section extraction works without env prompt ID (hardcoded fallback)", async () => {
    // Confirm no env ID is set (test environment)
    expect(getAiReviewPromptId("healthSectionExtraction")).toBeNull();

    mockLLMResponse.mockResolvedValue({
      parsed: {
        healthSectionPresent: true,
        questionnaireEntries: [
          { participantName: "Jan Novák", questionnairePresent: true },
        ],
      },
    });

    const packetMeta: PacketMeta = {
      isBundle: true,
      bundleConfidence: 0.8,
      detectionMethods: ["keyword_scan"],
      subdocumentCandidates: [
        { type: "health_questionnaire", confidence: 0.85, label: "Zdravotní dotazník", publishable: false },
        { type: "final_contract", confidence: 0.9, label: "Smlouva", publishable: true },
      ],
      primarySubdocumentType: "final_contract",
      hasSensitiveAttachment: true,
      hasUnpublishableSection: true,
      packetWarnings: [],
    };

    const envelope: DocumentReviewEnvelope = {
      documentClassification: {
        primaryType: "life_insurance_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "new_contract",
        confidence: 0.9,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
      publishHints: {
        contractPublishable: true,
        reviewOnly: false,
        needsSplit: false,
        needsManualValidation: false,
        sensitiveAttachmentOnly: false,
        reasons: [],
      },
    } as DocumentReviewEnvelope;

    const text = "Pojistná smlouva č. POL-12345. Zdravotní dotazník — Jan Novák.".padEnd(400, " ");
    const result = await orchestrateSubdocumentExtraction(text, packetMeta, envelope);

    expect(result.orchestrationRan).toBe(true);
    // Health extraction ran via fallback (createResponseStructured was called)
    expect(mockLLMResponse).toHaveBeenCalled();
  });

  it("DC15: investment section extraction works without env prompt ID (hardcoded fallback)", async () => {
    expect(getAiReviewPromptId("investmentSectionExtraction")).toBeNull();

    mockLLMResponse.mockResolvedValue({
      parsed: {
        investmentSectionPresent: true,
        productType: "DIP",
        strategy: "Dynamická",
        funds: [],
        isModeledData: false,
        isContractualData: true,
      },
    });

    const packetMeta: PacketMeta = {
      isBundle: true,
      bundleConfidence: 0.75,
      detectionMethods: ["keyword_scan"],
      subdocumentCandidates: [
        { type: "investment_section", confidence: 0.82, label: "DIP sekce", publishable: true },
      ],
      primarySubdocumentType: "investment_section",
      hasSensitiveAttachment: false,
      hasUnpublishableSection: false,
      packetWarnings: [],
    };

    const envelope: DocumentReviewEnvelope = {
      documentClassification: {
        primaryType: "pension_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "new_contract",
        confidence: 0.85,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
      investmentData: null,
      publishHints: {
        contractPublishable: true,
        reviewOnly: false,
        needsSplit: false,
        needsManualValidation: false,
        sensitiveAttachmentOnly: false,
        reasons: [],
      },
    } as DocumentReviewEnvelope;

    const text = DIP_TEXT.padEnd(400, " ");
    const result = await orchestrateSubdocumentExtraction(text, packetMeta, envelope);

    expect(result.orchestrationRan).toBe(true);
    expect(mockLLMResponse).toHaveBeenCalled();
  });
});

// ─── DC16: publishHints not weakened ─────────────────────────────────────────

describe("publishHints preservation after DIP/DPS classification", () => {
  it("DC16: hard publish blocks not removed by DIP/DPS override logic", () => {
    // applyProductFamilyTextOverride only changes routing — publishHints handled separately
    const result = applyProductFamilyTextOverride("life_insurance", DIP_TEXT);
    // The function only returns routing info — it doesn't touch publishHints
    expect(result).not.toHaveProperty("contractPublishable");
    expect(result).not.toHaveProperty("sensitiveAttachmentOnly");
  });
});

// ─── DC17–DC19: Router routing for DIP/DPS/PP ────────────────────────────────

describe("extraction router — DIP/DPS/PP family routing", () => {
  it("DC17: dip family + contract → dipExtraction prompt key", () => {
    const result = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "dip",
      productSubtype: "unknown",
      businessIntent: "new_contract",
      recommendedRoute: "extract",
      confidence: 0.85,
    });
    expect(result.outcome).toBe("extract");
    if (result.outcome === "extract") {
      expect(result.promptKey).toBe("dipExtraction");
    }
  });

  it("DC18: dps family + contract → retirementProductExtraction prompt key", () => {
    const result = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "dps",
      productSubtype: "unknown",
      businessIntent: "new_contract",
      recommendedRoute: "extract",
      confidence: 0.85,
    });
    expect(result.outcome).toBe("extract");
    if (result.outcome === "extract") {
      expect(result.promptKey).toBe("retirementProductExtraction");
    }
  });

  it("DC19: pp family + contract → retirementProductExtraction prompt key", () => {
    const result = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "pp",
      productSubtype: "unknown",
      businessIntent: "new_contract",
      recommendedRoute: "extract",
      confidence: 0.85,
    });
    expect(result.outcome).toBe("extract");
    if (result.outcome === "extract") {
      expect(result.promptKey).toBe("retirementProductExtraction");
    }
  });
});
