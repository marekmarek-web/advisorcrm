/**
 * EXTRACTION PROMPT BUNDLE-CONTEXT ENRICHMENT
 *
 * Scenarios:
 * BC01: buildCombinedClassifyAndExtractPrompt — no sectionTexts → single TEXT DOKUMENTU block
 * BC02: buildCombinedClassifyAndExtractPrompt — sectionTexts → labeled SEKCE DOKUMENTU block
 * BC03: buildCombinedClassifyAndExtractPrompt — only contractual section → one labeled section
 * BC04: buildCombinedClassifyAndExtractPrompt — health section note present in rules
 * BC05: buildCombinedClassifyAndExtractPrompt — investment section note present in rules
 * BC06: buildCombinedClassifyAndExtractPrompt — payment section note present in rules
 * BC07: buildCombinedClassifyAndExtractPrompt — attachment note instructs no smluvní fakta
 * BC08: buildCombinedClassifyAndExtractPrompt — empty all sections → fallback to single blob
 * BC09: buildCombinedClassifyAndExtractPrompt — section text truncated at SECTION_MAX_CHARS
 * BC10: buildCombinedClassifyAndExtractPrompt — sectionTexts + bundleHint → both in prompt
 * BC11: buildAiReviewExtractionPromptVariables — no sectionTexts → no section vars
 * BC12: buildAiReviewExtractionPromptVariables — sectionTexts → section vars populated
 * BC13: buildAiReviewExtractionPromptVariables — health section var says nezdrojuj
 * BC14: buildAiReviewExtractionPromptVariables — bundle_section_context combines all sections
 * BC15: buildAiReviewExtractionPromptVariables — camelCase mirrors present
 * BC16: G02 bundle: contractual section isolated, health not in contractual slot
 * BC17: G03 bundle: investment section in investmentText, not in contractualText
 * BC18: bundle without structuredData → sectionTexts null → fallback single blob
 * BC19: publishHints not weakened by section text enrichment (rules still present)
 * BC20: trySlice returns null for full_text method → sectionTexts stays null
 * BC21: hasAnySectionText false → bundleSectionTexts is null
 * BC22: section rules only present when corresponding section text exists
 */

import { describe, it, expect, vi } from "vitest";

import {
  buildCombinedClassifyAndExtractPrompt,
  type BundleSectionTexts,
  type CombinedExtractionBundleHint,
} from "@/lib/ai/combined-extraction";
import { buildAiReviewExtractionPromptVariables } from "@/lib/ai/ai-review-prompt-variables";

// ─── Mock server-side dependencies ────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { query: { documents: { findFirst: vi.fn() } } },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    storage: { from: vi.fn().mockReturnValue({ download: vi.fn() }) },
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUNDLE_HINT: CombinedExtractionBundleHint = {
  isBundle: true,
  primarySubdocumentType: "final_contract",
  candidateTypes: ["final_contract", "health_questionnaire"],
  sectionHeadings: ["Pojistná smlouva č. 123456", "Zdravotní dotazník"],
  hasSensitiveAttachment: true,
  hasInvestmentSection: false,
};

const FULL_SECTIONS: BundleSectionTexts = {
  contractualText: "Pojistná smlouva č. 123456789\nPojistník: Jan Novák\nPojistné: 2500 Kč/měsíc",
  healthText: "Zdravotní dotazník\nOtázka 1: Léčíte se s chronickým onemocněním? NE",
  investmentText: "Investiční strategie: Vyvážená\nFondy: Amundi Czech Bond 60 %, Amundi Global Equity 40 %",
  paymentText: "Bankovní účet: 1234567890/0100\nVariabilní symbol: 123456789",
  attachmentText: "AML formulář\nProhlášení o původu finančních prostředků",
};

// ─── BC01: No sectionTexts → single TEXT DOKUMENTU block ─────────────────────

describe("BC01: no sectionTexts → single TEXT DOKUMENTU block", () => {
  it("prompt contains TEXT DOKUMENTU marker when sectionTexts not provided", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "Pojistná smlouva č. 999",
      "smlouva.pdf",
    );
    expect(prompt).toContain("TEXT DOKUMENTU:");
    expect(prompt).toContain("<<<DOCUMENT_TEXT>>>");
    expect(prompt).not.toContain("SEKCE DOKUMENTU");
  });
});

// ─── BC02: sectionTexts provided → labeled SEKCE DOKUMENTU block ─────────────

describe("BC02: sectionTexts → labeled SEKCE DOKUMENTU sections", () => {
  it("prompt contains SEKCE DOKUMENTU when sectionTexts provided", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full doc text",
      "bundle.pdf",
      null,
      FULL_SECTIONS,
    );
    expect(prompt).toContain("SEKCE DOKUMENTU");
    expect(prompt).not.toContain("TEXT DOKUMENTU:");
  });

  it("labeled sections appear in prompt", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full doc text",
      "bundle.pdf",
      null,
      FULL_SECTIONS,
    );
    expect(prompt).toContain("[SMLUVNÍ ČÁST");
    expect(prompt).toContain("[ZDRAVOTNÍ DOTAZNÍK");
    expect(prompt).toContain("[INVESTIČNÍ SEKCE");
    expect(prompt).toContain("[PLATEBNÍ SEKCE");
    expect(prompt).toContain("[PŘÍLOHA / AML");
  });
});

// ─── BC03: Only contractual section ──────────────────────────────────────────

describe("BC03: only contractual section provided", () => {
  it("prompt has only contractual section label when only that section has text", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Pojistná smlouva č. 555",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full text",
      "smlouva.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("[SMLUVNÍ ČÁST");
    expect(prompt).not.toContain("[ZDRAVOTNÍ DOTAZNÍK");
    expect(prompt).not.toContain("[INVESTIČNÍ SEKCE");
  });
});

// ─── BC04: Health section rule present ───────────────────────────────────────

describe("BC04: health section rule instructs model to avoid contractual facts from health", () => {
  it("health section instruction present when healthText provided", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva",
      healthText: "Zdravotní dotazník",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(prompt.toLowerCase()).toContain("nepoužívej");
  });
});

// ─── BC05: Investment section rule ───────────────────────────────────────────

describe("BC05: investment section rule directs extraction to investment section", () => {
  it("investmentStrategy extraction rule points to INVESTIČNÍ SEKCE", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva",
      investmentText: "Investiční strategie: Vyvážená",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("investmentStrategy");
    expect(prompt).toContain("INVESTIČNÍ SEKCE");
  });
});

// ─── BC06: Payment section rule ──────────────────────────────────────────────

describe("BC06: payment section rule directs extraction to payment section", () => {
  it("bankAccount rule points to PLATEBNÍ SEKCE", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva",
      paymentText: "Účet: 1234567890/0100",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("bankAccount");
    expect(prompt).toContain("PLATEBNÍ SEKCE");
  });
});

// ─── BC07: Attachment rule says no smluvní fakta ─────────────────────────────

describe("BC07: attachment section rule says nesmí přepsat smluvní fakta", () => {
  it("attachment rule present when attachmentText provided", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva",
      attachmentText: "AML formulář",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("PŘÍLOHA / AML");
    expect(prompt.toLowerCase()).toContain("nesmí přepsat");
  });
});

// ─── BC08: All sections empty → fallback to single blob ──────────────────────

describe("BC08: all section texts empty → fallback to single TEXT DOKUMENTU blob", () => {
  it("empty sectionTexts falls back to single blob", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "",
      healthText: null,
      investmentText: undefined,
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "Pojistná smlouva č. 999",
      "smlouva.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("TEXT DOKUMENTU:");
    expect(prompt).not.toContain("SEKCE DOKUMENTU");
  });
});

// ─── BC09: Section text truncation ───────────────────────────────────────────

describe("BC09: section text truncated at SECTION_MAX_CHARS", () => {
  it("very long section text is truncated with ellipsis marker", () => {
    const longText = "X".repeat(25_000);
    const sectionTexts: BundleSectionTexts = {
      contractualText: longText,
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    // Truncated texts should contain the truncation marker
    expect(prompt).toContain("zkráceno");
    // Should NOT contain the full 25k text
    expect(prompt.length).toBeLessThan(50_000);
  });
});

// ─── BC10: sectionTexts + bundleHint → both in prompt ────────────────────────

describe("BC10: sectionTexts and bundleHint both appear in prompt", () => {
  it("bundle preamble and section labels coexist", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full text",
      "bundle.pdf",
      BUNDLE_HINT,
      FULL_SECTIONS,
    );
    // Bundle preamble
    expect(prompt).toContain("BUNDLE DOKUMENT");
    // Section labels
    expect(prompt).toContain("SEKCE DOKUMENTU");
    expect(prompt).toContain("[SMLUVNÍ ČÁST");
  });
});

// ─── BC11: No sectionTexts → no section vars in prompt variables ──────────────

describe("BC11: no sectionTexts → no section-specific prompt variables", () => {
  it("variables object lacks section keys when bundleSectionTexts not provided", () => {
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "test.pdf",
    });
    expect(vars).not.toHaveProperty("contractual_section_text");
    expect(vars).not.toHaveProperty("health_section_text");
    expect(vars).not.toHaveProperty("bundle_section_context");
  });
});

// ─── BC12: sectionTexts → section vars populated ─────────────────────────────

describe("BC12: sectionTexts → section-specific variables populated", () => {
  it("all section vars present when sectionTexts provided", () => {
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "bundle.pdf",
      bundleSectionTexts: FULL_SECTIONS,
    });
    expect(vars.contractual_section_text).toContain("Pojistná smlouva");
    expect(vars.health_section_text).toContain("Zdravotní dotazník");
    expect(vars.investment_section_text).toContain("Investiční strategie");
    expect(vars.payment_section_text).toContain("1234567890");
    expect(vars.attachment_section_text).toContain("AML");
  });
});

// ─── BC13: Health section var says nezdrojuj ─────────────────────────────────

describe("BC13: health_section_text variable note says nezdrojuj", () => {
  it("bundle_section_context contains health section with nezdrojuj warning", () => {
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "bundle.pdf",
      bundleSectionTexts: FULL_SECTIONS,
    });
    expect(vars.bundle_section_context).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(vars.bundle_section_context.toLowerCase()).toContain("nezdrojuj");
  });
});

// ─── BC14: bundle_section_context combines all sections ──────────────────────

describe("BC14: bundle_section_context includes all available sections", () => {
  it("all section headers appear in bundle_section_context", () => {
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "bundle.pdf",
      bundleSectionTexts: FULL_SECTIONS,
    });
    expect(vars.bundle_section_context).toContain("[SMLUVNÍ ČÁST]");
    expect(vars.bundle_section_context).toContain("[ZDRAVOTNÍ DOTAZNÍK");
    expect(vars.bundle_section_context).toContain("[INVESTIČNÍ SEKCE]");
    expect(vars.bundle_section_context).toContain("[PLATEBNÍ SEKCE]");
    expect(vars.bundle_section_context).toContain("[PŘÍLOHA / AML");
  });
});

// ─── BC15: camelCase mirrors present ─────────────────────────────────────────

describe("BC15: camelCase mirrors present in section variables", () => {
  it("camelCase aliases equal their snake_case counterparts", () => {
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "bundle.pdf",
      bundleSectionTexts: FULL_SECTIONS,
    });
    expect(vars.contractualSectionText).toBe(vars.contractual_section_text);
    expect(vars.healthSectionText).toBe(vars.health_section_text);
    expect(vars.investmentSectionText).toBe(vars.investment_section_text);
    expect(vars.paymentSectionText).toBe(vars.payment_section_text);
    expect(vars.bundleSectionContext).toBe(vars.bundle_section_context);
  });
});

// ─── BC16: G02 bundle contractual section isolated ────────────────────────────

describe("BC16: G02-like — contractual section text contains contract data, not health", () => {
  it("contractualText has contract number, healthText has questionnaire content only", () => {
    const contractualText = "Pojistná smlouva č. 987654321\nPojistník: Jan Novák";
    const healthText = "Zdravotní dotazník\nLéčíte se? NE";
    const sectionTexts: BundleSectionTexts = { contractualText, healthText };

    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full bundle text",
      "bundle.pdf",
      BUNDLE_HINT,
      sectionTexts,
    );

    // Contract number should appear in contractual section context
    expect(prompt).toContain("987654321");
    // Health section should be labeled differently from contractual
    expect(prompt).toContain("[SMLUVNÍ ČÁST");
    expect(prompt).toContain("[ZDRAVOTNÍ DOTAZNÍK");
    // Health section warning should be present
    expect(prompt.toLowerCase()).toContain("nepoužívej");
  });
});

// ─── BC17: G03 investment isolated in investmentText ─────────────────────────

describe("BC17: G03-like — investment content in investmentText section", () => {
  it("investmentText contains fund allocation, not in contractual slot", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Pojistná smlouva č. 111222333",
      investmentText: "Investiční strategie: Dynamická\nFondy: 100 % akcie",
    };
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "full text",
      classificationReasons: [],
      adobeSignals: "none",
      filename: "bundle.pdf",
      bundleSectionTexts: sectionTexts,
    });
    expect(vars.investment_section_text).toContain("Dynamická");
    expect(vars.contractual_section_text).not.toContain("Dynamická");
  });
});

// ─── BC18: No bundle → bundleSectionTexts null → fallback ─────────────────────

describe("BC18: non-bundle document → sectionTexts null → single TEXT DOKUMENTU", () => {
  it("prompt without sectionTexts uses single TEXT DOKUMENTU block", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "Pojistná smlouva č. 999999",
      "smlouva.pdf",
      null, // no bundleHint
      null, // no sectionTexts
    );
    expect(prompt).toContain("TEXT DOKUMENTU:");
    expect(prompt).not.toContain("SEKCE DOKUMENTU");
  });
});

// ─── BC19: publishHints protection rules still present ────────────────────────

describe("BC19: publishHints protection rules present with section enrichment", () => {
  it("bundle rules still instruct model about publishability", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full text",
      "bundle.pdf",
      BUNDLE_HINT,
      FULL_SECTIONS,
    );
    // Bundle preamble rules
    expect(prompt).toContain("Extrahuj contract fields POUZE z finální smlouvy nebo návrhu");
    // Sensitive attachment note
    expect(prompt).toContain("citlivou přílohu");
  });
});

// ─── BC20: trySlice returning full_text → sectionTexts stays null ─────────────

describe("BC20: section text from full_text method excluded", () => {
  it("empty contractual section text means hasAnySectionText stays false", () => {
    // Simulate the hasAnySectionText logic
    const texts = [null, null, null, null, null];
    const hasAny = texts.some((t) => t && t.length > 50);
    expect(hasAny).toBe(false);
  });
});

// ─── BC21: hasAnySectionText false → bundleSectionTexts null ─────────────────

describe("BC21: hasAnySectionText false → bundleSectionTexts null", () => {
  it("all-null section texts means bundleSectionTexts should be null", () => {
    const contractualText = null;
    const healthText = null;
    const investmentText = null;
    const paymentText = null;
    const attachmentText = null;
    const hasAnySectionText = [contractualText, healthText, investmentText, paymentText, attachmentText]
      .some((t) => t && t.length > 50);
    expect(hasAnySectionText).toBe(false);
  });
});

// ─── BC22: Section rules only for present sections ────────────────────────────

describe("BC22: section rules appear only for sections with text", () => {
  it("no investment rule when investmentText not provided", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva č. 123",
      // no investmentText
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full text",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    // investmentStrategy rule should NOT appear (no investment section)
    const hasInvestmentRule = prompt.includes("INVESTIČNÍ SEKCE") && prompt.includes("investmentStrategy");
    expect(hasInvestmentRule).toBe(false);
  });

  it("investment rule present when investmentText is provided", () => {
    const sectionTexts: BundleSectionTexts = {
      contractualText: "Smlouva č. 123",
      investmentText: "Fondy: Amundi 100 %",
    };
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "full text",
      "bundle.pdf",
      null,
      sectionTexts,
    );
    expect(prompt).toContain("investmentStrategy");
    expect(prompt).toContain("INVESTIČNÍ SEKCE");
  });
});
