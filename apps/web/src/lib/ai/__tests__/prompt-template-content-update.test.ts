/**
 * PROMPT TEMPLATE CONTENT UPDATE
 *
 * Scenarios:
 * PT01: wrapExtractionPromptWithDocumentText — no sectionTexts → single DOCUMENT_TEXT block
 * PT02: wrapExtractionPromptWithDocumentText — with sectionTexts → SEKCE DOKUMENTU block
 * PT03: wrapExtractionPromptWithDocumentText — health section labeled nezdrojuj
 * PT04: wrapExtractionPromptWithDocumentText — attachment labeled nesmí přepsat
 * PT05: wrapExtractionPromptWithDocumentText — empty sections → fallback single blob
 * PT06: wrapExtractionPromptWithDocumentText — long section text truncated
 * PT07: buildSchemaPrompt — no bundleContext → no BUNDLE PRAVIDLA section
 * PT08: buildSchemaPrompt — with bundleContext.hasSensitiveAttachment → bundle rule present
 * PT09: buildSchemaPrompt — with bundleContext.hasInvestmentSection → investment rule present
 * PT10: buildSchemaPrompt — life insurance + health_questionnaire candidate → health rule
 * PT11: buildSchemaPrompt — hasSectionTexts true → section sourcing rule present
 * PT12: buildHealthSectionExtractionPrompt — isolation note mentions fyzicky izolován
 * PT13: buildHealthSectionExtractionPrompt — explicitly says NEEXTRAHUJ contractual facts
 * PT14: buildInvestmentSectionExtractionPrompt — isolation note mentions fyzicky izolován
 * PT15: buildInvestmentSectionExtractionPrompt — explicitly says NEEXTRAHUJ pojistná rizika
 * PT16: buildInvestmentSectionExtractionPrompt — narrowed context note present
 * PT17: getPromptTemplateContent — returns template for valid key
 * PT18: getPromptTemplateContent — returns null for unknown key
 * PT19: INSURANCE_CONTRACT_EXTRACTION_TEMPLATE — includes contractual_section_text variable
 * PT20: DIP_EXTRACTION_TEMPLATE — has DIP-specific critical note about productType
 * PT21: HEALTH_SECTION_EXTRACTION_TEMPLATE — has NEEXTRAHUJ contractual facts rule
 * PT22: INVESTMENT_SECTION_EXTRACTION_TEMPLATE — has section isolation note
 * PT23: bundle final contract + health: health not used for contractual facts
 * PT24: bundle modelation: lifecycleStatus must be modelation/proposal (not active/signed)
 */

import { describe, it, expect, vi } from "vitest";

import {
  wrapExtractionPromptWithDocumentText,
  buildExtractionPrompt,
} from "@/lib/ai/extraction-schemas-by-type";
import {
  buildSchemaPrompt,
  type SchemaPromptBundleContext,
} from "@/lib/ai/document-schema-registry";
import {
  buildHealthSectionExtractionPrompt,
  buildInvestmentSectionExtractionPrompt,
} from "@/lib/ai/subdocument-section-prompts";
import {
  getPromptTemplateContent,
  INSURANCE_CONTRACT_EXTRACTION_TEMPLATE,
  DIP_EXTRACTION_TEMPLATE,
  HEALTH_SECTION_EXTRACTION_TEMPLATE,
  INVESTMENT_SECTION_EXTRACTION_TEMPLATE,
  INSURANCE_PROPOSAL_MODELATION_TEMPLATE,
} from "@/lib/ai/ai-review-prompt-templates-content";
import type { BundleSectionTexts } from "@/lib/ai/combined-extraction";
import type { PacketSubdocumentCandidate } from "@/lib/ai/document-packet-types";

// ─── Mock server-side dependencies ────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { query: { documents: { findFirst: vi.fn() } } },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_PROMPT = "Jsi extrakční engine. Rules: extract all fields.";

const FULL_SECTIONS: BundleSectionTexts = {
  contractualText: "Pojistná smlouva č. 123456789\nPojistník: Jan Novák",
  healthText: "Zdravotní dotazník\nLéčíte se? NE",
  investmentText: "Investiční strategie: Vyvážená\nFondy: Amundi 100 %",
  paymentText: "Účet: 1234567890/0100\nVariabilní symbol: 123456789",
  attachmentText: "AML formulář\nProhlášení",
};

const HEALTH_CANDIDATES: PacketSubdocumentCandidate[] = [
  {
    type: "health_questionnaire",
    label: "Zdravotní dotazník",
    confidence: 0.9,
    publishable: false,
    sectionHeadingHint: "Zdravotní prohlášení",
    pageRangeHint: null,
    sensitivityHint: "health_data",
    charOffsetHint: null,
    pageNumbers: null,
  },
];

// ─── PT01: No sectionTexts → single DOCUMENT_TEXT block ──────────────────────

describe("PT01: no sectionTexts → single DOCUMENT_TEXT block", () => {
  it("prompt contains DOCUMENT_TEXT when no sectionTexts", () => {
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "full document text");
    expect(result).toContain("<<<DOCUMENT_TEXT>>>");
    expect(result).not.toContain("SEKCE DOKUMENTU");
  });
});

// ─── PT02: With sectionTexts → SEKCE DOKUMENTU block ─────────────────────────

describe("PT02: with sectionTexts → SEKCE DOKUMENTU block", () => {
  it("prompt contains SEKCE DOKUMENTU when sectionTexts provided", () => {
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "full text", undefined, FULL_SECTIONS);
    expect(result).toContain("SEKCE DOKUMENTU");
    expect(result).toContain("[SMLUVNÍ ČÁST]");
  });
});

// ─── PT03: Health section labeled with warning ────────────────────────────────

describe("PT03: health section labeled with nezdrojuj warning", () => {
  it("health section has NEPOUŽÍVEJ warning in wrapped prompt", () => {
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "full", undefined, FULL_SECTIONS);
    expect(result).toContain("[ZDRAVOTNÍ DOTAZNÍK");
    expect(result.toLowerCase()).toContain("nepoužívej");
  });
});

// ─── PT04: Attachment section has nesmí přepsat warning ──────────────────────

describe("PT04: attachment section labeled with nesmí přepsat warning", () => {
  it("attachment section has nesmí přepsat in wrapped prompt", () => {
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "full", undefined, FULL_SECTIONS);
    expect(result).toContain("[PŘÍLOHA / AML");
    expect(result.toLowerCase()).toContain("nesmí přepsat");
  });
});

// ─── PT05: Empty all sections → fallback single blob ─────────────────────────

describe("PT05: all section texts empty → fallback to single DOCUMENT_TEXT blob", () => {
  it("empty sectionTexts uses single blob", () => {
    const emptySections: BundleSectionTexts = {
      contractualText: "",
      healthText: null,
    };
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "main text", undefined, emptySections);
    expect(result).toContain("<<<DOCUMENT_TEXT>>>");
    expect(result).not.toContain("SEKCE DOKUMENTU");
  });
});

// ─── PT06: Long section text truncated ────────────────────────────────────────

describe("PT06: long section text truncated", () => {
  it("very long contractual text is truncated", () => {
    const longSection: BundleSectionTexts = {
      contractualText: "A".repeat(20_000),
    };
    const result = wrapExtractionPromptWithDocumentText(BASE_PROMPT, "full", undefined, longSection);
    expect(result).toContain("zkráceno");
    expect(result.length).toBeLessThan(60_000);
  });
});

// ─── PT07: buildSchemaPrompt — no bundleContext → no BUNDLE PRAVIDLA ──────────

describe("PT07: buildSchemaPrompt without bundleContext — no BUNDLE PRAVIDLA", () => {
  it("schema prompt has no BUNDLE PRAVIDLA when no bundle context", () => {
    const prompt = buildExtractionPrompt("life_insurance_contract", false, null);
    expect(prompt).not.toContain("BUNDLE PRAVIDLA");
  });
});

// ─── PT08: buildSchemaPrompt — hasSensitiveAttachment → bundle rule ───────────

describe("PT08: buildSchemaPrompt with hasSensitiveAttachment → bundle rule present", () => {
  it("schema prompt includes sensitive attachment rule", () => {
    const ctx: SchemaPromptBundleContext = {
      hasSensitiveAttachment: true,
    };
    const prompt = buildExtractionPrompt("life_insurance_contract", false, ctx);
    expect(prompt).toContain("BUNDLE PRAVIDLA");
    expect(prompt.toLowerCase()).toContain("citlivou přílohu");
  });
});

// ─── PT09: buildSchemaPrompt — hasInvestmentSection → investment rule ─────────

describe("PT09: buildSchemaPrompt with hasInvestmentSection → investment section rule", () => {
  it("schema prompt mentions INVESTIČNÍ SEKCE rule", () => {
    const ctx: SchemaPromptBundleContext = {
      hasInvestmentSection: true,
    };
    const prompt = buildExtractionPrompt("life_insurance_contract", false, ctx);
    expect(prompt).toContain("BUNDLE PRAVIDLA");
    expect(prompt).toContain("INVESTIČNÍ SEKCE");
  });
});

// ─── PT10: life insurance + health_questionnaire candidate → health rule ───────

describe("PT10: life insurance + health_questionnaire candidate → health isolation rule", () => {
  it("schema prompt includes health questionnaire contamination rule", () => {
    const ctx: SchemaPromptBundleContext = {
      hasSensitiveAttachment: true,
      candidateTypes: ["final_contract", "health_questionnaire"],
    };
    const prompt = buildExtractionPrompt("life_insurance_contract", false, ctx);
    expect(prompt).toContain("BUNDLE PRAVIDLA");
    expect(prompt.toLowerCase()).toContain("zdravotní dotazník");
  });
});

// ─── PT11: hasSectionTexts true → section sourcing rule ──────────────────────

describe("PT11: hasSectionTexts true → section sourcing rule in schema prompt", () => {
  it("schema prompt mentions SMLUVNÍ ČÁSTI when hasSectionTexts", () => {
    const ctx: SchemaPromptBundleContext = {
      hasSectionTexts: true,
      hasSensitiveAttachment: false,
    };
    const prompt = buildExtractionPrompt("life_insurance_contract", false, ctx);
    expect(prompt).toContain("SMLUVNÍ ČÁSTI");
  });
});

// ─── PT12: buildHealthSectionExtractionPrompt — fyzicky izolován note ─────────

describe("PT12: buildHealthSectionExtractionPrompt — isolation note for narrowed window", () => {
  it("short text gets fyzicky izolován note", () => {
    const shortText = "Zdravotní dotazník\nOtázka 1: Léčíte se? NE".repeat(10);
    const prompt = buildHealthSectionExtractionPrompt(shortText, HEALTH_CANDIDATES);
    expect(prompt.toLowerCase()).toContain("fyzicky izolován");
  });
});

// ─── PT13: buildHealthSectionExtractionPrompt — NEEXTRAHUJ contractual facts ──

describe("PT13: buildHealthSectionExtractionPrompt — explicitly forbids contractual facts", () => {
  it("prompt contains NEEXTRAHUJ contractual facts rule", () => {
    const prompt = buildHealthSectionExtractionPrompt("zdravotní text", HEALTH_CANDIDATES);
    expect(prompt).toContain("NEEXTRAHUJ");
    expect(prompt.toLowerCase()).toContain("contractual facts");
  });
});

// ─── PT14: buildInvestmentSectionExtractionPrompt — fyzicky izolován note ─────

describe("PT14: buildInvestmentSectionExtractionPrompt — isolation note for narrowed window", () => {
  it("short investment text gets fyzicky izolován note", () => {
    const shortText = "Investiční strategie: Vyvážená\nFondy: Amundi 60 %";
    const candidates: PacketSubdocumentCandidate[] = [];
    const prompt = buildInvestmentSectionExtractionPrompt(shortText, candidates);
    expect(prompt.toLowerCase()).toContain("fyzicky izolován");
  });
});

// ─── PT15: buildInvestmentSectionExtractionPrompt — NEEXTRAHUJ pojistná rizika ─

describe("PT15: buildInvestmentSectionExtractionPrompt — forbids pojistná rizika", () => {
  it("prompt says NEEXTRAHUJ pojistná rizika", () => {
    const prompt = buildInvestmentSectionExtractionPrompt("investiční text", []);
    expect(prompt).toContain("NEEXTRAHUJ");
    expect(prompt.toLowerCase()).toContain("pojistná rizika");
  });
});

// ─── PT16: buildInvestmentSectionExtractionPrompt — narrowed context note ─────

describe("PT16: buildInvestmentSectionExtractionPrompt — contextNote differs for narrow/full", () => {
  it("short text gets investiční sekce context note", () => {
    const shortText = "X".repeat(100);
    const prompt = buildInvestmentSectionExtractionPrompt(shortText, []);
    expect(prompt).toContain("investiční sekci");
  });

  it("long text gets full text context note", () => {
    const longText = "X".repeat(25_000);
    const prompt = buildInvestmentSectionExtractionPrompt(longText, []);
    expect(prompt).toContain("VÝHRADNĚ na investiční sekci");
  });
});

// ─── PT17: getPromptTemplateContent — valid key ───────────────────────────────

describe("PT17: getPromptTemplateContent returns template for valid key", () => {
  it("returns template for insuranceContractExtraction", () => {
    const t = getPromptTemplateContent("insuranceContractExtraction");
    expect(t).not.toBeNull();
    expect(t?.key).toBe("insuranceContractExtraction");
    expect(t?.systemPrompt.length).toBeGreaterThan(100);
  });
});

// ─── PT18: getPromptTemplateContent — unknown key → null ─────────────────────

describe("PT18: getPromptTemplateContent returns null for unknown key", () => {
  it("returns null for non-existent key", () => {
    const t = getPromptTemplateContent("nonExistentPrompt");
    expect(t).toBeNull();
  });
});

// ─── PT19: INSURANCE_CONTRACT_EXTRACTION_TEMPLATE — section variables ─────────

describe("PT19: INSURANCE_CONTRACT_EXTRACTION_TEMPLATE includes section variables", () => {
  it("template references contractual_section_text and health_section_text", () => {
    expect(INSURANCE_CONTRACT_EXTRACTION_TEMPLATE.variables).toContain("contractual_section_text");
    expect(INSURANCE_CONTRACT_EXTRACTION_TEMPLATE.variables).toContain("health_section_text");
    expect(INSURANCE_CONTRACT_EXTRACTION_TEMPLATE.systemPrompt).toContain("{{contractual_section_text}}");
    expect(INSURANCE_CONTRACT_EXTRACTION_TEMPLATE.systemPrompt).toContain("{{health_section_text}}");
  });

  it("template instructs health section not to be used for contractual facts", () => {
    expect(INSURANCE_CONTRACT_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("neextrahuj");
  });
});

// ─── PT20: DIP_EXTRACTION_TEMPLATE — DIP-specific critical note ───────────────

describe("PT20: DIP_EXTRACTION_TEMPLATE has DIP critical note", () => {
  it("DIP template has critical note about productType not being changed", () => {
    expect(DIP_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("dip");
    expect(DIP_EXTRACTION_TEMPLATE.systemPrompt).toContain("KRITICKÉ");
  });

  it("DIP template instructions say not to change productType from DIP", () => {
    expect(DIP_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("producttype");
  });
});

// ─── PT21: HEALTH_SECTION_EXTRACTION_TEMPLATE — no contractual facts ─────────

describe("PT21: HEALTH_SECTION_EXTRACTION_TEMPLATE forbids contractual facts", () => {
  it("health template says NEEXTRAHUJ", () => {
    expect(HEALTH_SECTION_EXTRACTION_TEMPLATE.systemPrompt).toContain("NEEXTRAHUJ");
    expect(HEALTH_SECTION_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("contractual facts");
  });

  it("health template only accepts extracted_text variable (section-specific)", () => {
    expect(HEALTH_SECTION_EXTRACTION_TEMPLATE.variables).toContain("extracted_text");
    // Health template should NOT reference bundle_section_context (it gets only its own slice)
    expect(HEALTH_SECTION_EXTRACTION_TEMPLATE.variables).not.toContain("bundle_section_context");
  });
});

// ─── PT22: INVESTMENT_SECTION_EXTRACTION_TEMPLATE — isolation ────────────────

describe("PT22: INVESTMENT_SECTION_EXTRACTION_TEMPLATE has isolation note", () => {
  it("investment template says fyzicky izolovaná", () => {
    expect(INVESTMENT_SECTION_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("fyzicky izolovaná");
  });

  it("investment template instructs not to extract pojistná rizika", () => {
    expect(INVESTMENT_SECTION_EXTRACTION_TEMPLATE.systemPrompt.toLowerCase()).toContain("pojistná rizika");
  });
});

// ─── PT23: Bundle health/contract isolation ───────────────────────────────────

describe("PT23: bundle final contract + health — health not used for contractual facts", () => {
  it("wrapExtractionPromptWithDocumentText health section labeled correctly for LLM", () => {
    const sections: BundleSectionTexts = {
      contractualText: "Smlouva č. 555666777\nPojistník: Petr Novák\nPojistné: 3000 Kč",
      healthText: "Zdravotní dotazník pro Petra Nováka\nLéčíte se s jakýmkoliv onemocněním? ANO",
    };
    const result = wrapExtractionPromptWithDocumentText(
      BASE_PROMPT,
      "full bundle text",
      undefined,
      sections,
    );
    expect(result).toContain("[SMLUVNÍ ČÁST]");
    expect(result).toContain("[ZDRAVOTNÍ DOTAZNÍK");
    expect(result.toLowerCase()).toContain("nepoužívej");
    // Contract data appears in contractual section slot
    expect(result).toContain("555666777");
    // Health text appears in health section slot
    expect(result).toContain("Léčíte se");
  });
});

// ─── PT24: Insurance Proposal/Modelation template — lifecycleStatus rules ─────

describe("PT24: INSURANCE_PROPOSAL_MODELATION_TEMPLATE — lifecycleStatus restrictions", () => {
  it("modelation template explicitly forbids active/signed lifecycle", () => {
    expect(INSURANCE_PROPOSAL_MODELATION_TEMPLATE.systemPrompt).toContain("NIKDY");
    expect(INSURANCE_PROPOSAL_MODELATION_TEMPLATE.systemPrompt.toLowerCase()).toContain("active");
    expect(INSURANCE_PROPOSAL_MODELATION_TEMPLATE.systemPrompt.toLowerCase()).toContain("signed");
  });

  it("modelation template sets isProposalOnly = true", () => {
    expect(INSURANCE_PROPOSAL_MODELATION_TEMPLATE.systemPrompt).toContain("isProposalOnly = true");
  });
});
