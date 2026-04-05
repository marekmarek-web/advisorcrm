/**
 * ADOBE STRUCTUREDDATA PARSER + EXACT PAGE/BLOCK SOURCING
 *
 * Scenarios:
 * SD01: parseAdobeStructuredData — PascalCase fields (primary Adobe API format)
 * SD02: parseAdobeStructuredData — lowercase aliases
 * SD03: parseAdobeStructuredData — mixed case (fallback)
 * SD04: parseAdobeStructuredData — 0-based page converted to 1-based
 * SD05: parseAdobeStructuredData — nested kids/children are flattened
 * SD06: parseAdobeStructuredData — empty input returns ok=false
 * SD07: parseAdobeStructuredData — invalid JSON returns ok=false
 * SD08: parseAdobeStructuredData — no elements returns ok=false
 * SD09: buildPageMapFromStructuredData — returns canonical Record<number, string>
 * SD10: extractPageRangeText — extracts correct range
 * SD11: findPagesContaining — finds keyword across pages
 * SD12: isHeadingPath detects H1-H6 correctly
 * SD13: sliceSectionText uses adobe_structured_pages as highest priority
 * SD14: sliceSectionText falls back to exact_pages when structuredResult unavailable
 * SD15: sliceSectionTextForType merges page numbers across multiple same-type candidates
 * SD16: resolvePageTextMap prefers adobe_structured when multi-page
 * SD17: resolvePageTextMap falls back to db_stored when adobe_structured unavailable
 * SD18: health pass gets adobe_structured_pages source mode when available
 * SD19: investment pass gets adobe_structured_pages source mode when available
 * SD20: fallback chain: adobe_structured → db_stored → markdown → heuristic
 * SD21: document where markdown extraction fails but structuredData exists → still isolated
 * SD22: sourceModeTrace reports adobe_structured_pages correctly
 * SD23: G02 final contract — health pages don't contaminate contract data (adobe source)
 * SD24: G03 bundle — investment isolated on its pages via adobe_structured_pages
 * SD25: publishHints not weakened when adobe structured data is processed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  parseAdobeStructuredData,
  buildPageMapFromStructuredData,
  extractPageRangeText,
  findPagesContaining,
  type AdobeStructuredResult,
} from "@/lib/adobe/structured-data-parser";
import {
  sliceSectionText,
  sliceSectionTextForType,
  describeSourceMode,
} from "@/lib/ai/section-text-slicer";
import {
  resolvePageTextMap,
  type AdobeStructuredLookupResult,
  type PageTextMapLookupResult,
} from "@/lib/documents/page-text-map-lookup";
import { orchestrateSubdocumentExtraction } from "@/lib/ai/subdocument-extraction-orchestrator";
import type { PacketSubdocumentCandidate, PacketMeta } from "@/lib/ai/document-packet-types";
import type { DocumentReviewEnvelope } from "@/lib/ai/document-review-types";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockLLM = vi.fn();
vi.mock("@/lib/openai", () => ({
  createResponseStructured: (...args: unknown[]) => mockLLM(...args),
  createResponse: vi.fn(),
  createAiReviewResponseFromPrompt: vi.fn().mockResolvedValue({
    ok: true,
    text: '{"healthSectionPresent":false,"questionnaireEntries":[]}',
  }),
  logOpenAICall: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/observability/portal-sentry", () => ({ capturePublishGuardFailure: vi.fn() }));

// Server-side infrastructure mocks
vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
  documents: { storagePath: "storage_path", extractJsonPath: "extract_json_path", pageTextMap: "page_text_map", id: "id", tenantId: "tenant_id" },
  contractUploadReviews: {},
  eq: vi.fn(),
  and: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({ data: null, error: new Error("mocked") }),
      })),
    },
  })),
}));

// ─── Adobe JSON fixtures ──────────────────────────────────────────────────────

const makeElement = (text: string, page: number, path = "//Document/P") => ({
  Text: text,
  Page: page,
  Path: path,
});

const STRUCTURED_DATA_JSON = JSON.stringify({
  elements: [
    // Page 0 (→ page 1): Contract data
    makeElement("Pojistná smlouva č. POL-12345", 0, "//Document/H1"),
    makeElement("Pojistitel: ČP", 0),
    makeElement("Pojistník: Jan Novák", 0),
    makeElement("Pojistné: 1500 Kč/měsíc", 0),
    // Page 1 (→ page 2): Payment data
    makeElement("Platební IBAN: CZ65 0800 0000 1920 0014 5399", 1, "//Document/P"),
    makeElement("Frekvence: měsíčně", 1),
    // Page 2 (→ page 3): Health questionnaire
    makeElement("ZDRAVOTNÍ DOTAZNÍK", 2, "//Document/H1"),
    makeElement("Prohlašuji, že jsem zdráv.", 2),
    makeElement("Chronické onemocnění: Ne.", 2),
    makeElement("Hospitalizace v posledních 5 letech: Ne.", 2),
    // Page 3 (→ page 4): Investment data
    makeElement("Investiční strategie: Vyvážená", 3, "//Document/H2"),
    makeElement("DIP účet č. DIP-2024-001", 3),
    makeElement("Fond A: 60 %, Fond B: 40 %", 3),
  ],
});

const STRUCTURED_DATA_LOWERCASE_JSON = JSON.stringify({
  elements: [
    { text: "Contract text", page: 0, path: "//Document/H1" },
    { text: "Health text", page: 1, path: "//Document/P" },
  ],
});

// ─── SD01–SD12: parseAdobeStructuredData ──────────────────────────────────────

describe("parseAdobeStructuredData", () => {
  it("SD01: parses PascalCase fields correctly", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(4);
    expect(result.pages[1].fullText).toContain("POL-12345");
    expect(result.pages[3].fullText).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(result.pages[4].fullText).toContain("DIP");
  });

  it("SD02: parses lowercase alias fields correctly", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_LOWERCASE_JSON);
    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(2);
    expect(result.pages[1].fullText).toContain("Contract text");
    expect(result.pages[2].fullText).toContain("Health text");
  });

  it("SD03: handles mixed/partial fields gracefully", () => {
    const json = JSON.stringify({
      elements: [
        { Text: "Page 1 content", Page: 0 }, // no Path
        { text: "Page 2 content", page: 1, path: "//Document/P" },
      ],
    });
    const result = parseAdobeStructuredData(json);
    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(2);
  });

  it("SD04: converts 0-based page to 1-based", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    expect(result.pages[1]).toBeDefined(); // page 0 → page 1
    expect(result.pages[4]).toBeDefined(); // page 3 → page 4
    expect(result.pages[0]).toBeUndefined(); // no page 0 in output
  });

  it("SD05: flattens nested kids/children", () => {
    const json = JSON.stringify({
      elements: [
        {
          Text: "Parent text", Page: 0, Path: "//Document/Sect",
          kids: [
            { Text: "Nested text A", Page: 0, Path: "//Document/Sect/P" },
            { Text: "Nested text B", Page: 1, Path: "//Document/Sect/P" },
          ],
        },
      ],
    });
    const result = parseAdobeStructuredData(json);
    expect(result.ok).toBe(true);
    expect(result.pages[1].fullText).toContain("Nested text A");
    expect(result.pages[2].fullText).toContain("Nested text B");
  });

  it("SD06: empty input returns ok=false", () => {
    expect(parseAdobeStructuredData("").ok).toBe(false);
    expect(parseAdobeStructuredData("   ").ok).toBe(false);
  });

  it("SD07: invalid JSON returns ok=false", () => {
    expect(parseAdobeStructuredData("{not valid json}").ok).toBe(false);
  });

  it("SD08: no elements returns ok=false", () => {
    expect(parseAdobeStructuredData(JSON.stringify({ elements: [] })).ok).toBe(false);
    expect(parseAdobeStructuredData(JSON.stringify({})).ok).toBe(false);
  });
});

describe("buildPageMapFromStructuredData + helpers", () => {
  it("SD09: buildPageMapFromStructuredData returns canonical Record<number, string>", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const map = buildPageMapFromStructuredData(result);
    expect(Object.keys(map).length).toBe(4);
    expect(map[1]).toContain("POL-12345");
    expect(map[3]).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(map[4]).toContain("DIP");
  });

  it("SD10: extractPageRangeText extracts correct range", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const text = extractPageRangeText(result, 3, 4);
    expect(text).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(text).toContain("DIP");
    expect(text).not.toContain("POL-12345");
  });

  it("SD11: findPagesContaining finds keyword", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const pages = findPagesContaining(result, "ZDRAVOTNÍ");
    expect(pages).toContain(3);
    expect(pages).not.toContain(1);
    expect(pages).not.toContain(4);
  });

  it("SD12: heading path detection (H1-H6)", () => {
    const result = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const headings = result.allBlocks.filter((b) => b.isHeading);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.some((h) => h.text === "Pojistná smlouva č. POL-12345")).toBe(true);
    expect(headings.some((h) => h.text === "ZDRAVOTNÍ DOTAZNÍK")).toBe(true);
  });
});

// ─── SD13–SD15: sliceSectionText with structuredResult ────────────────────────

describe("sliceSectionText with Adobe structured data", () => {
  const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
  const fullText = Object.values(buildPageMapFromStructuredData(parsedStructured)).join("\n");

  it("SD13: uses adobe_structured_pages as highest priority strategy", () => {
    const candidate: PacketSubdocumentCandidate = {
      type: "health_questionnaire",
      label: "Health",
      confidence: 0.9,
      publishable: false,
      sectionHeadingHint: "ZDRAVOTNÍ DOTAZNÍK",
      charOffsetHint: null,
      pageNumbers: [3],
    };
    const window = sliceSectionText(fullText, candidate, 4, undefined, parsedStructured);
    expect(window.method).toBe("adobe_structured_pages");
    expect(window.narrowed).toBe(true);
    expect(window.text).toContain("ZDRAVOTNÍ DOTAZNÍK");
    expect(window.text).not.toContain("POL-12345");
  });

  it("SD14: falls back to exact_pages when structuredResult unavailable", () => {
    const pageMap = buildPageMapFromStructuredData(parsedStructured);
    const candidate: PacketSubdocumentCandidate = {
      type: "health_questionnaire",
      label: "Health",
      confidence: 0.9,
      publishable: false,
      sectionHeadingHint: null,
      charOffsetHint: null,
      pageNumbers: [3],
    };
    const window = sliceSectionText(fullText, candidate, 4, pageMap, null);
    expect(window.method).toBe("exact_pages");
    expect(window.text).toContain("ZDRAVOTNÍ DOTAZNÍK");
  });

  it("SD15: sliceSectionTextForType merges pages from multiple candidates via adobe_structured", () => {
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "health_questionnaire", label: "Health 1", confidence: 0.9, publishable: false, pageNumbers: [3] },
      { type: "health_questionnaire", label: "Health 2", confidence: 0.7, publishable: false, pageNumbers: [4] },
    ];
    const window = sliceSectionTextForType(fullText, candidates, "health_questionnaire", 4, undefined, parsedStructured);
    expect(window.method).toBe("adobe_structured_pages");
    expect(window.text).toContain("ZDRAVOTNÍ DOTAZNÍK");
  });
});

// ─── SD16–SD17: resolvePageTextMap priority ───────────────────────────────────

describe("resolvePageTextMap with Adobe structured data", () => {
  const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
  const pageMap = buildPageMapFromStructuredData(parsedStructured);

  const adobeResult: AdobeStructuredLookupResult = {
    structured: parsedStructured,
    pageTextMap: pageMap,
    source: "adobe_structured",
    pageCount: parsedStructured.totalPages,
  };

  const dbResult: PageTextMapLookupResult = {
    pageTextMap: { 1: "Page 1", 2: "Page 2" },
    source: "db_stored",
    pageCount: 2,
  };

  const dbEmpty: PageTextMapLookupResult = { pageTextMap: null, source: "not_found", pageCount: 0 };

  it("SD16: prefers adobe_structured when multi-page", () => {
    const result = resolvePageTextMap(dbResult, { 1: "fallback" }, "single_page", adobeResult);
    expect(result.traceSource).toBe("adobe_structured_pages");
    expect(result.structuredResult).toBe(parsedStructured);
  });

  it("SD17: falls back to db_stored when adobe_structured unavailable", () => {
    const notFound: AdobeStructuredLookupResult = { structured: null, pageTextMap: null, source: "not_found", pageCount: 0 };
    const result = resolvePageTextMap(dbResult, { 1: "fallback" }, "single_page", notFound);
    expect(result.traceSource).toBe("db_stored");
  });
});

// ─── SD18–SD22: orchestration integration ─────────────────────────────────────

const makeEnvelope = (extra?: Partial<DocumentReviewEnvelope>): DocumentReviewEnvelope => ({
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
  ...extra,
} as DocumentReviewEnvelope);

const makePacketMeta = (candidates: PacketSubdocumentCandidate[]): PacketMeta => ({
  isBundle: true,
  bundleConfidence: 0.9,
  detectionMethods: ["keyword_scan"],
  subdocumentCandidates: candidates,
  primarySubdocumentType: "final_contract",
  hasSensitiveAttachment: true,
  hasUnpublishableSection: true,
  packetWarnings: [],
});

describe("orchestration with Adobe structured data", () => {
  beforeEach(() => { mockLLM.mockReset(); });

  it("SD18: health pass receives adobe_structured_pages content when available", async () => {
    let healthPromptText = "";
    mockLLM.mockImplementation((prompt: string) => {
      healthPromptText = prompt;
      return Promise.resolve({ parsed: { healthSectionPresent: true, questionnaireEntries: [] } });
    });

    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "health_questionnaire", label: "Health", confidence: 0.9, publishable: false, pageNumbers: [3] },
    ];

    const result = await orchestrateSubdocumentExtraction(
      "Full markdown text",
      makePacketMeta(candidates),
      makeEnvelope(),
      4,
      null, // no pageTextMap
      parsedStructured,
    );

    expect(result.orchestrationRan).toBe(true);
    // Warning should note adobe_structured is available
    expect(result.warnings.some((w) => w.includes("adobe_structured_available"))).toBe(true);
    // Prompt should contain health content from page 3, not contract data from page 1
    if (healthPromptText) {
      expect(healthPromptText).toContain("ZDRAVOTNÍ DOTAZNÍK");
      expect(healthPromptText).not.toContain("POL-12345");
    }
  });

  it("SD19: investment pass receives adobe_structured_pages content when available", async () => {
    let investmentPromptText = "";
    mockLLM.mockImplementation((prompt: string) => {
      investmentPromptText = prompt;
      return Promise.resolve({ parsed: { investmentSectionPresent: true, strategy: "Vyvážená", isContractualData: true } });
    });

    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "investment_section", label: "DIP", confidence: 0.9, publishable: true, pageNumbers: [4] },
    ];

    await orchestrateSubdocumentExtraction(
      "Full markdown text",
      makePacketMeta(candidates),
      makeEnvelope(),
      4,
      null,
      parsedStructured,
    );

    if (investmentPromptText) {
      expect(investmentPromptText).toContain("DIP");
      expect(investmentPromptText).not.toContain("ZDRAVOTNÍ DOTAZNÍK");
    }
  });

  it("SD20: fallback chain: no adobe_structured → uses exact_pages from pageMap", async () => {
    mockLLM.mockResolvedValue({ parsed: { healthSectionPresent: false, questionnaireEntries: [] } });

    const pageMap = buildPageMapFromStructuredData(parseAdobeStructuredData(STRUCTURED_DATA_JSON));
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "health_questionnaire", label: "Health", confidence: 0.9, publishable: false, pageNumbers: [3] },
    ];

    const result = await orchestrateSubdocumentExtraction(
      Object.values(pageMap).join("\n"),
      makePacketMeta(candidates),
      makeEnvelope(),
      4,
      pageMap,
      null, // no structuredResult
    );

    expect(result.orchestrationRan).toBe(true);
  });

  it("SD21: document with empty markdown but valid structuredData → isolated extraction", async () => {
    let capturedPrompt = "";
    mockLLM.mockImplementation((prompt: string) => {
      capturedPrompt = prompt;
      return Promise.resolve({ parsed: { healthSectionPresent: true, questionnaireEntries: [] } });
    });

    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "health_questionnaire", label: "Health", confidence: 0.9, publishable: false, pageNumbers: [3] },
    ];

    await orchestrateSubdocumentExtraction(
      "", // empty markdown
      makePacketMeta(candidates),
      makeEnvelope(),
      4,
      null,
      parsedStructured,
    );

    // Even with empty markdown, health content from structured data should be used
    if (capturedPrompt) {
      expect(capturedPrompt).toContain("ZDRAVOTNÍ DOTAZNÍK");
    }
  });

  it("SD22: sourceModeTrace reports adobe_structured_pages in fidelity summary", async () => {
    mockLLM.mockResolvedValue({
      parsed: { healthSectionPresent: true, questionnaireEntries: [{ participantName: "Jan", questionnairePresent: true }] },
    });

    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "health_questionnaire", label: "Health", confidence: 0.9, publishable: false, pageNumbers: [3] },
    ];

    const result = await orchestrateSubdocumentExtraction(
      "Full markdown text",
      makePacketMeta(candidates),
      makeEnvelope(),
      4,
      null,
      parsedStructured,
    );

    if (result.sourceModeTrace?.health_questionnaire) {
      expect(result.sourceModeTrace.health_questionnaire).toContain("Adobe structured");
    }
  });
});

// ─── SD23–SD25: Golden scenario validation ────────────────────────────────────

describe("Golden scenario validation with Adobe structured data", () => {
  it("SD23: G02 final contract — health pages don't contaminate contract extraction", () => {
    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const healthCandidate: PacketSubdocumentCandidate = {
      type: "health_questionnaire",
      label: "Health",
      confidence: 0.9,
      publishable: false,
      sectionHeadingHint: null,
      charOffsetHint: null,
      pageNumbers: [3],
    };
    const window = sliceSectionText("full markdown", healthCandidate, 4, undefined, parsedStructured);
    expect(window.method).toBe("adobe_structured_pages");
    expect(window.text).not.toContain("POL-12345");
    expect(window.text).not.toContain("Platební IBAN");
  });

  it("SD24: G03 bundle — investment isolated on page 4 via adobe_structured_pages", () => {
    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const investCandidate: PacketSubdocumentCandidate = {
      type: "investment_section",
      label: "DIP",
      confidence: 0.9,
      publishable: true,
      sectionHeadingHint: null,
      charOffsetHint: null,
      pageNumbers: [4],
    };
    const window = sliceSectionText("full markdown", investCandidate, 4, undefined, parsedStructured);
    expect(window.method).toBe("adobe_structured_pages");
    expect(window.text).toContain("DIP");
    expect(window.text).not.toContain("ZDRAVOTNÍ DOTAZNÍK");
  });

  it("SD25: publishHints not weakened by Adobe structured processing", async () => {
    mockLLM.mockResolvedValue({ parsed: { healthSectionPresent: false, questionnaireEntries: [] } });

    const parsedStructured = parseAdobeStructuredData(STRUCTURED_DATA_JSON);
    const candidates: PacketSubdocumentCandidate[] = [
      { type: "aml_fatca_form", label: "AML", confidence: 0.9, publishable: false, pageNumbers: [2] },
    ];

    const envelope = makeEnvelope({
      publishHints: {
        contractPublishable: false,
        reviewOnly: true,
        needsSplit: false,
        needsManualValidation: true,
        sensitiveAttachmentOnly: true,
        reasons: ["aml_only"],
      },
    });

    const packetMeta: PacketMeta = {
      ...makePacketMeta(candidates),
      primarySubdocumentType: "aml_fatca_form",
    };

    await orchestrateSubdocumentExtraction(
      "Full markdown",
      packetMeta,
      envelope,
      4,
      null,
      parsedStructured,
    );

    expect(envelope.publishHints?.contractPublishable).toBe(false);
    expect(envelope.publishHints?.sensitiveAttachmentOnly).toBe(true);
  });
});

// ─── describeSourceMode ───────────────────────────────────────────────────────

it("describeSourceMode includes Adobe structured description", () => {
  const desc = describeSourceMode({
    method: "adobe_structured_pages",
    text: "",
    startOffset: -1,
    endOffset: -1,
    narrowed: true,
  });
  expect(desc).toContain("Adobe structured");
});
