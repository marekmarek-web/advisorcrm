/**
 * Phase 2 — Document Packet Segmentation
 *
 * Analyses the markdown text hint extracted from a PDF and detects whether
 * the upload is a multi-document "packet" (bundle). Returns a PacketMeta
 * that flows into extractionTrace and the DocumentReviewEnvelope.
 *
 * This is a heuristic/keyword-based first pass — no additional LLM call.
 * It is intentionally conservative: false-negative (miss a bundle) is safer
 * than false-positive (split a single document into phantom sections).
 *
 * Page-level splitting is NOT performed in this iteration.
 * The output tells the extraction layer WHAT is in the packet; routing per
 * subdocument type is handled in a follow-up wave.
 */

import type {
  PacketMeta,
  PacketSubdocumentCandidate,
  PacketSubdocumentType,
} from "./document-packet-types";
import type { AdobeStructuredResult } from "@/lib/adobe/structured-data-parser";

// ─── Keyword signal tables ─────────────────────────────────────────────────

type SectionSignal = {
  type: PacketSubdocumentType;
  label: string;
  /** Regex patterns (case-insensitive) that strongly indicate this section. */
  strongPatterns: RegExp[];
  /** Regex patterns that weakly suggest this section. */
  weakPatterns: RegExp[];
  publishable: boolean;
  sensitivityHint?: string;
};

const SECTION_SIGNALS: SectionSignal[] = [
  {
    type: "health_questionnaire",
    label: "Zdravotní dotazník",
    strongPatterns: [
      /zdravotní\s+dotazník/i,
      /zdravotní\s+prohlášení/i,
      /anamnéza/i,
      /zdravotní\s+stav\s+pojišt/i,
      /lékařská\s+zpráva/i,
      /medical\s+questionnaire/i,
    ],
    weakPatterns: [
      /zdravotní\s+stav/i,
      /chronické\s+onemocnění/i,
      /léčíte\s+se/i,
      /hospitalizace/i,
      /disability.*questionnaire/i,
    ],
    publishable: false,
    sensitivityHint: "health_data",
  },
  {
    type: "aml_fatca_form",
    label: "AML / FATCA formulář",
    strongPatterns: [
      /AML\s+formulář/i,
      /prohlášení\s+o\s+původu\s+finančních\s+prostředků/i,
      /FATCA/i,
      /politicky\s+exponovaná\s+osoba/i,
      /PEP\s+status/i,
      /formulář\s+pro\s+zjišt.*totožnosti/i,
    ],
    weakPatterns: [
      /\bAML\b/i,
      /původ\s+prostředků/i,
      /praní\s+peněz/i,
      /skutečný\s+majitel/i,
    ],
    publishable: false,
    sensitivityHint: "compliance",
  },
  {
    type: "payment_instruction",
    label: "Platební instrukce",
    strongPatterns: [
      /platební\s+instrukce/i,
      /pokyny\s+k\s+platbě/i,
      /FUNDOO/i,
      /příkaz\s+k\s+inkasu/i,
      /SIPA\s+(seznam|platba)/i,
    ],
    weakPatterns: [
      /variabilní\s+symbol.*[0-9]{6,}/i,
      /číslo\s+účtu.*[0-9]{6,}/i,
    ],
    publishable: false,
  },
  {
    type: "modelation",
    label: "Modelace / ilustrace",
    strongPatterns: [
      /modelace\s+pojišt/i,
      /ilustrace\s+pojišt/i,
      /nabídka\s+pojišt/i,
      /nezávazná\s+kalkulace/i,
      /nezávazný\s+výpočet/i,
      /orientační\s+výpočet/i,
    ],
    weakPatterns: [
      /modelac[ei]/i,
      /kalkulace\s+premi/i,
      /orientační\s+nabídka/i,
    ],
    publishable: false,
  },
  {
    type: "contract_proposal",
    label: "Návrh smlouvy",
    strongPatterns: [
      /návrh\s+pojistné\s+smlouvy/i,
      /návrh\s+smlouvy/i,
      /návrh\s+č\.\s*[0-9]/i,
      /offer\s+number/i,
    ],
    weakPatterns: [
      /číslo\s+návrhu/i,
      /tento\s+návrh\s+platí/i,
    ],
    // Business rule (finality rule): "Návrh" je v 99 % případů finální smlouva,
    // kterou poradce po kontrole publikuje. Modelace/kalkulace/ilustrace jsou
    // řešeny samostatným `modelation` signálem níže (publishable: false).
    publishable: true,
  },
  {
    type: "final_contract",
    label: "Finální smlouva",
    strongPatterns: [
      /pojistná\s+smlouva\s+č\./i,
      /smlouva\s+č\.\s*[0-9]/i,
      /číslo\s+smlouvy\s*:\s*[0-9]/i,
      /policy\s+number\s*:\s*[0-9]/i,
      /smlouva\s+o\s+úvěru/i,
      /smlouva\s+o\s+poskytnutí/i,
    ],
    weakPatterns: [
      /datum\s+počátku\s+pojištění/i,
      /datum\s+uzavření\s+smlouvy/i,
    ],
    publishable: true,
  },
  {
    type: "annex",
    label: "Příloha / sazebník",
    strongPatterns: [
      /příloha\s+(č\.|[0-9])/i,
      /annex\s+[0-9]/i,
      /sazebník\s+poplatků/i,
      /obchodní\s+podmínky/i,
    ],
    weakPatterns: [
      /\bpříloha\b/i,
    ],
    publishable: false,
  },
  {
    type: "investment_section",
    label: "Investiční sekce / DIP / DPS",
    strongPatterns: [
      /dlouhodobý\s+investiční\s+produkt/i,
      /\bDIP\b/,
      /doplňkové\s+penzijní\s+spoření/i,
      /\bDPS\b/,
      /penzijní\s+připojištění/i,
      /\bPP\b.*penzijní/i,
      /investiční\s+smlouva/i,
      /investiční\s+program/i,
      /fondové\s+pojištění/i,
      /FUNDOO/i,
      /investiční\s+část\s+pojistné/i,
      /fond[yů]\s+.*alokac/i,
    ],
    weakPatterns: [
      /investiční\s+strategie/i,
      /alokace\s+fondů/i,
      /investiční\s+prémie/i,
      /\bfond[yů]?\b.*%/i,
      /výkonnost\s+fondu/i,
      /hodnota\s+podílových\s+jednotek/i,
    ],
    publishable: true, // investment contracts CAN be published as standalone documents
  },
  {
    type: "service_document",
    label: "Servisní / doprovodný dokument",
    strongPatterns: [
      /žádost\s+o\s+změnu/i,
      /oznámení\s+pojistné\s+události/i,
      /podnět\s+ke\s+storno/i,
      /žádost\s+o\s+odkup/i,
    ],
    weakPatterns: [
      /žádost.*změn/i,
      /potvrzení.*změn/i,
    ],
    publishable: false,
  },
];

// ─── Heading index pattern: documents often start with a table of contents ──

const EXPLICIT_INDEX_PATTERNS = [
  /obsah\s*\n/i,
  /seznam\s+dokumentů/i,
  /přehled\s+dokumentů/i,
  /přiložené\s+dokumenty/i,
  /\d\.\s+zdravotní\s+dotazník/i,
  /\d\.\s+pojistná\s+smlouva/i,
  /\d\.\s+AML/i,
  /\d\.\s+FATCA/i,
  /\d\.\s+investiční/i,
  /\d\.\s+DIP/i,
  /\d\.\s+DPS/i,
  /\d\.\s+penzijní/i,
];

// ─── Core segmentation logic ──────────────────────────────────────────────

function scoreSignal(signal: SectionSignal, text: string): number {
  let score = 0;
  for (const p of signal.strongPatterns) {
    if (p.test(text)) score += 0.6;
  }
  for (const p of signal.weakPatterns) {
    if (p.test(text)) score += 0.2;
  }
  return Math.min(score, 1.0);
}

/**
 * Locate the first character offset where this signal fires in the text.
 * Returns null if no strong or weak pattern matches.
 */
function locateSignalFirstMatch(signal: SectionSignal, text: string): number | null {
  for (const p of signal.strongPatterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    const m = re.exec(text);
    if (m) return m.index;
  }
  for (const p of signal.weakPatterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    const m = re.exec(text);
    if (m) return m.index;
  }
  return null;
}

/**
 * Find the heading line around the given character offset.
 * Scans backwards up to 300 chars for the start of the current line,
 * then returns that line if it looks like a section heading.
 */
function findHeadingNearOffset(text: string, offset: number): string | null {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = text.indexOf("\n", offset);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  // Accept as heading: 5–100 chars, not just numbers/symbols
  if (line.length >= 5 && line.length <= 100 && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽa-záčďéěíňóřšťúůýž]/.test(line)) {
    return line;
  }
  return null;
}

/**
 * Extract page numbers from the text window around a given offset.
 * Looks for "strana N" / "strana N z M" / "page N" patterns within ±1500 chars
 * of the signal match offset to infer which physical pages the section spans.
 * Returns a sorted unique array of page numbers, or null if none found.
 */
function detectPageNumbersNearOffset(text: string, offset: number): number[] | null {
  const window = text.slice(Math.max(0, offset - 1500), Math.min(text.length, offset + 3000));
  const pageNums = new Set<number>();

  // "strana N z M" or "strana N"
  const stranaRe = /strana\s+(\d+)(?:\s+z\s+\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = stranaRe.exec(window)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 999) pageNums.add(n);
  }

  // "page N" (English, from Adobe markdown output)
  const pageRe = /(?:^|\n)(?:page|pg\.?)\s+(\d+)/gi;
  while ((m = pageRe.exec(window)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 999) pageNums.add(n);
  }

  // Page break markers like "--- page N ---" or "<!-- page N -->"
  const markerRe = /(?:---\s*page\s*(\d+)\s*---|<!--\s*page\s*(\d+)\s*-->)/gi;
  while ((m = markerRe.exec(window)) !== null) {
    const n = parseInt(m[1] ?? m[2], 10);
    if (n > 0 && n <= 999) pageNums.add(n);
    // Also include the next page (section might start there)
    if (n + 1 <= 999) pageNums.add(n + 1);
  }

  if (pageNums.size === 0) return null;
  return Array.from(pageNums).sort((a, b) => a - b);
}

/**
 * Given a page number detected in the text and an approximate total page count,
 * build a conservative page range: the section likely spans 2-4 pages.
 */
function buildPageRange(detectedPages: number[], totalPages: number | null): number[] {
  if (detectedPages.length === 0) return [];
  const first = Math.min(...detectedPages);
  const last = Math.max(...detectedPages);
  // Extend by 1 page on each side for safety, capped at total
  const start = Math.max(1, first);
  const end = Math.min(totalPages ?? last + 3, last + 2);
  const range: number[] = [];
  for (let p = start; p <= end; p++) range.push(p);
  return range;
}

function detectExplicitIndex(text: string): boolean {
  return EXPLICIT_INDEX_PATTERNS.some((p) => p.test(text));
}

/** Estimate page count from markdown: look for page-break markers or "strana N" patterns. */
function estimatePageCount(text: string): number | null {
  const pageBreakMatches = (text.match(/---\s*\n|<page[-_]break\s*\/>|\f/g) ?? []).length;
  if (pageBreakMatches > 0) return pageBreakMatches + 1;
  const stranaMatches = (text.match(/strana\s+\d+\s+z\s+\d+/gi) ?? []);
  if (stranaMatches.length > 0) {
    const nums = stranaMatches
      .map((m) => {
        const match = m.match(/z\s+(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    if (nums.length > 0) return Math.max(...nums);
  }
  return null;
}

function tryExtractPageRangeHint(text: string, signalType: PacketSubdocumentType): string | null {
  const sectionLabel: string = {
    health_questionnaire: "zdravotní dotazník",
    aml_fatca_form: "AML",
    payment_instruction: "platební instrukce",
    modelation: "modelace",
    contract_proposal: "návrh",
    final_contract: "smlouva",
    annex: "příloha",
    service_document: "žádost",
    investment_section: "investiční",
    unpublishable_attachment: "",
    other: "",
  }[signalType] ?? "";

  if (!sectionLabel) return null;

  const pageNumPattern = new RegExp(
    `${sectionLabel}[\\s\\S]{0,200}strana\\s+(\\d+)`,
    "i"
  );
  const m = text.match(pageNumPattern);
  if (m) return `~${m[1]}+`;

  return null;
}

export interface PacketSegmentationResult {
  packetMeta: PacketMeta;
}

/**
 * Analyse a document's extracted text and return packet segmentation metadata.
 *
 * @param markdownHint  - full markdown/text content from preprocessing (may be empty)
 * @param pageCount     - page count from preprocess meta (optional)
 * @param fileName      - original file name (optional, used for heuristics)
 */
export function segmentDocumentPacket(
  markdownHint: string,
  pageCount?: number | null,
  fileName?: string | null
): PacketSegmentationResult {
  const warnings: string[] = [];
  const text = markdownHint ?? "";

  if (text.length < 200) {
    return {
      packetMeta: {
        isBundle: false,
        bundleConfidence: 0,
        detectionMethods: [],
        subdocumentCandidates: [],
        primarySubdocumentType: null,
        hasSensitiveAttachment: false,
        hasUnpublishableSection: false,
        packetWarnings: ["insufficient_text_for_segmentation"],
      },
    };
  }

  const detectionMethods: PacketMeta["detectionMethods"] = [];
  const candidates: PacketSubdocumentCandidate[] = [];

  // Pre-compute page count so it's available during signal scanning (step 2) and page range detection
  const detectedPageCount = pageCount ?? estimatePageCount(text);

  // 1. Scan for explicit document index
  const hasExplicitIndex = detectExplicitIndex(text);
  if (hasExplicitIndex) {
    detectionMethods.push("explicit_index");
  }

  // 2. Score each known section signal and locate its first occurrence for text narrowing
  // Threshold 0.3 = at least one strong hit (0.6) that's partial, or multiple weak hits (3×0.2).
  // A single weak-only match (score 0.2) is not enough to classify a candidate — too many false positives.
  for (const signal of SECTION_SIGNALS) {
    const score = scoreSignal(signal, text);
    if (score >= 0.3) {
      if (!detectionMethods.includes("keyword_scan")) {
        detectionMethods.push("keyword_scan");
      }
      const firstMatchOffset = locateSignalFirstMatch(signal, text);
      const headingHint =
        firstMatchOffset !== null ? findHeadingNearOffset(text, firstMatchOffset) : null;
      const detectedPages =
        firstMatchOffset !== null ? detectPageNumbersNearOffset(text, firstMatchOffset) : null;
      const pageNumbers = detectedPages
        ? buildPageRange(detectedPages, detectedPageCount)
        : null;

      const candidate: PacketSubdocumentCandidate = {
        type: signal.type,
        label: signal.label,
        confidence: score,
        publishable: signal.publishable,
        sectionHeadingHint: headingHint,
        pageRangeHint: tryExtractPageRangeHint(text, signal.type),
        sensitivityHint: signal.sensitivityHint ?? null,
        charOffsetHint: firstMatchOffset !== null
          ? { start: Math.max(0, firstMatchOffset - 200), end: firstMatchOffset }
          : null,
        pageNumbers,
      };
      candidates.push(candidate);
    }
  }

  // 3. Look for section headings (capitalized Czech headings on their own line)
  const headingPattern = /^([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s]{8,60})$/gm;
  const headings: string[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headingPattern.exec(text)) !== null) {
    headings.push(hm[1].trim());
  }
  if (headings.length >= 3) {
    detectionMethods.push("section_heading");
  }

  // 4. Page count heuristic: >12 pages AND multiple signals → likely bundle
  const isLongDocument = (detectedPageCount ?? 0) > 12;
  const hasMultipleSignals = candidates.length >= 2;
  if (isLongDocument && hasMultipleSignals) {
    detectionMethods.push("page_count_heuristic");
  }

  // 5. Determine if this is a bundle
  const sensitiveTypes: PacketSubdocumentType[] = ["health_questionnaire", "aml_fatca_form"];
  // NOTE: `contract_proposal` is NOT listed here — per the finality rule, a "Návrh
  // pojistné smlouvy" is treated as a final publishable contract after advisor
  // confirmation. Only true non-binding projections (`modelation`) stay here.
  const unpublishableTypes: PacketSubdocumentType[] = [
    "health_questionnaire",
    "aml_fatca_form",
    "payment_instruction",
    "modelation",
    "annex",
    "service_document",
    "unpublishable_attachment",
  ];

  // Raised thresholds to reduce false positives:
  // - sensitive attachment: requires strong signal (>= 0.5) — a single keyword hit is not enough
  // - unpublishable: >= 0.4 (was 0.3) — requires either strong match or ≥2 weak matches
  const hasSensitiveAttachment = candidates.some((c) => sensitiveTypes.includes(c.type) && c.confidence >= 0.5);
  const hasUnpublishableSection = candidates.some((c) => unpublishableTypes.includes(c.type) && c.confidence >= 0.4);

  // significantCandidates: only candidates with meaningful confidence (>= 0.35, was 0.3)
  const significantCandidates = candidates.filter((c) => c.confidence >= 0.35);
  const uniqueTypes = new Set(significantCandidates.map((c) => c.type));

  // isBundle requires BOTH:
  // - at least 2 significant unique types (each >= 0.35), AND
  // - at least one of them has confidence >= 0.4 (not just two barely-there signals)
  // OR an explicit document index is present (very reliable signal)
  // OR a sensitive attachment at >= 0.5 confidence alongside a publishable section
  const hasAtLeastOneStrongCandidate = significantCandidates.some((c) => c.confidence >= 0.4);
  const isBundle =
    (uniqueTypes.size >= 2 && hasAtLeastOneStrongCandidate) ||
    hasExplicitIndex ||
    (hasSensitiveAttachment && significantCandidates.some((c) => c.publishable));

  // Compute bundle confidence
  let bundleConfidence = 0;
  if (hasExplicitIndex) bundleConfidence += 0.5;
  if (uniqueTypes.size >= 2) bundleConfidence += Math.min((uniqueTypes.size - 1) * 0.25, 0.5);
  if (detectionMethods.includes("page_count_heuristic")) bundleConfidence += 0.15;
  if (detectionMethods.includes("section_heading") && uniqueTypes.size >= 2) bundleConfidence += 0.1;
  bundleConfidence = Math.min(bundleConfidence, 1.0);

  // Determine primary subdocument type (publishable one wins)
  const publishableCandidates = significantCandidates.filter((c) => c.publishable);
  const sortedByConf = [...significantCandidates].sort((a, b) => b.confidence - a.confidence);
  const primarySubdocumentType: PacketSubdocumentType | null =
    publishableCandidates.length > 0
      ? (publishableCandidates.sort((a, b) => b.confidence - a.confidence)[0]?.type ?? null)
      : (sortedByConf[0]?.type ?? null);

  if (isBundle && candidates.length === 0) {
    warnings.push("bundle_detected_but_no_candidates_classified");
  }

  const fileNameLower = (fileName ?? "").toLowerCase();
  if (fileNameLower.includes("gčp") || fileNameLower.includes("gcep") || fileNameLower.includes("balík")) {
    if (!detectionMethods.includes("keyword_scan")) {
      detectionMethods.push("keyword_scan");
    }
  }

  return {
    packetMeta: {
      isBundle,
      bundleConfidence,
      detectionMethods,
      subdocumentCandidates: candidates,
      primarySubdocumentType,
      hasSensitiveAttachment,
      hasUnpublishableSection,
      packetWarnings: warnings,
    },
  };
}

/**
 * Derives publishHints from the packet meta and existing extraction results.
 * Safe to call even when packetMeta is absent (uses fallback logic only).
 */
export function derivePublishHintsFromPacket(
  packetMeta: PacketMeta | null | undefined,
  lifecycleStatus?: string | null,
  sensitivityProfile?: string | null
): import("./document-packet-types").PublishHints {
  const reasons: string[] = [];

  // Business rule (finality rule):
  //   - "proposal" / "offer"  → 99 % případů finální smlouva, poradce jen potvrdí.
  //                             Publikujeme jako smlouvu, ale UI zobrazí info
  //                             alert "dokument je návrh — je to finální smlouva?".
  //   - "modelation" / "illustration" / "non_binding_projection" → nezávazná
  //                             projekce, nikdy nepublikovat jako smlouvu.
  const isActiveProposal =
    lifecycleStatus === "proposal" || lifecycleStatus === "offer";

  const isIllustrativeOnly =
    lifecycleStatus === "modelation" ||
    lifecycleStatus === "illustration" ||
    lifecycleStatus === "non_binding_projection";

  const isSensitive =
    sensitivityProfile === "health_data" ||
    sensitivityProfile === "special_category_data" ||
    sensitivityProfile === "mixed_sensitive_document";

  const hasSensitiveAttachment = packetMeta?.hasSensitiveAttachment ?? isSensitive;
  const needsSplit = !!(packetMeta?.isBundle && packetMeta?.hasSensitiveAttachment);
  // Proposals still require manual validation so the advisor consciously
  // confirms "ano, toto je finální smlouva" before apply.
  const needsManualValidation = !!(
    (packetMeta?.bundleConfidence ?? 0) > 0.3 ||
    hasSensitiveAttachment ||
    isActiveProposal ||
    isIllustrativeOnly
  );

  let contractPublishable = false;
  let reviewOnly = false;
  let sensitiveAttachmentOnly = false;

  const hasAnyPublishableSection = packetMeta?.subdocumentCandidates.some((c) => c.publishable) ?? false;
  const primaryIsContractLike =
    packetMeta?.primarySubdocumentType === "final_contract" ||
    packetMeta?.primarySubdocumentType === "contract_proposal" ||
    packetMeta?.primarySubdocumentType === "investment_section";

  if (isIllustrativeOnly) {
    reviewOnly = true;
    reasons.push("lifecycle_illustration_or_modelation");
  } else if (hasSensitiveAttachment && !hasAnyPublishableSection) {
    sensitiveAttachmentOnly = true;
    reasons.push("only_sensitive_sections_detected");
  } else if (primaryIsContractLike) {
    contractPublishable = true;
    if (isActiveProposal) {
      reasons.push("proposal_treated_as_final_contract");
    }
  } else if (!packetMeta) {
    contractPublishable = !isIllustrativeOnly && !isSensitive;
    if (isActiveProposal && contractPublishable) {
      reasons.push("proposal_treated_as_final_contract");
    }
  } else if (isActiveProposal) {
    // packetMeta present but primary is something unusual (e.g. payment_instruction);
    // still honor the finality rule — the advisor confirms the návrh is final.
    contractPublishable = true;
    reasons.push("proposal_treated_as_final_contract");
  }

  if (needsSplit) {
    reasons.push("bundle_contains_non_publishable_sections");
    contractPublishable = false;
  }

  if (hasSensitiveAttachment) reasons.push("sensitive_attachment_present");

  return {
    contractPublishable,
    reviewOnly: reviewOnly || (!contractPublishable && !sensitiveAttachmentOnly),
    needsSplit,
    needsManualValidation,
    sensitiveAttachmentOnly,
    reasons,
  };
}

// ─── Block-level heading segmentation from Adobe structured data ─────────────

/**
 * Enrich packet segmentation candidates using heading blocks from Adobe structured data.
 *
 * When Adobe Extract structuredData.json is available, its `isHeading=true` blocks provide
 * exact page numbers and clean heading text — much more reliable than markdown heuristics.
 *
 * This function:
 * 1. Iterates `allBlocks` where `isHeading=true`
 * 2. Matches heading text against SECTION_SIGNALS patterns
 * 3. Returns enriched candidates with accurate `pageNumbers` from structured data
 * 4. Only adds candidates that aren't already covered by the markdown segmentation
 *    (deduplication by type, taking the higher-confidence entry)
 *
 * Safe to call even when structuredResult is null (returns empty array).
 */
export function enrichCandidatesFromStructuredHeadings(
  existingCandidates: PacketSubdocumentCandidate[],
  structuredResult: AdobeStructuredResult | null | undefined,
  totalPages?: number | null,
): PacketSubdocumentCandidate[] {
  if (!structuredResult?.ok || structuredResult.allBlocks.length === 0) {
    return existingCandidates;
  }

  const headingBlocks = structuredResult.allBlocks.filter((b) => b.isHeading && b.text.trim().length > 3);
  if (headingBlocks.length === 0) {
    return existingCandidates;
  }

  // Map each heading block to a section signal match
  type HeadingCandidate = { type: PacketSubdocumentType; label: string; page: number; headingText: string; publishable: boolean; sensitivityHint?: string; score: number };
  const headingMatches: HeadingCandidate[] = [];

  for (const block of headingBlocks) {
    const normalized = block.text.trim();
    for (const signal of SECTION_SIGNALS) {
      let score = 0;
      for (const pat of signal.strongPatterns) {
        if (pat.test(normalized)) { score = Math.max(score, 0.9); break; }
      }
      if (score === 0) {
        for (const pat of signal.weakPatterns) {
          if (pat.test(normalized)) { score = Math.max(score, 0.5); break; }
        }
      }
      if (score >= 0.5) {
        headingMatches.push({
          type: signal.type,
          label: signal.label,
          page: block.page,
          headingText: normalized,
          publishable: signal.publishable,
          sensitivityHint: signal.sensitivityHint,
          score,
        });
        break; // first matching signal wins per block
      }
    }
  }

  if (headingMatches.length === 0) {
    return existingCandidates;
  }

  // Build a map of best structured-heading candidate per type
  const byType = new Map<PacketSubdocumentType, HeadingCandidate>();
  for (const match of headingMatches) {
    const existing = byType.get(match.type);
    if (!existing || match.score > existing.score) {
      byType.set(match.type, match);
    }
  }

  // Merge: structured candidates improve or add to existing markdown-derived candidates
  const result = existingCandidates.map((c) => {
    const structured = byType.get(c.type);
    if (!structured) return c;

    // Build page range around the detected heading page
    const rawPages = [structured.page];
    const enrichedPages = buildPageRange(rawPages, totalPages ?? structuredResult.totalPages ?? null);

    return {
      ...c,
      // Upgrade page numbers if structured is more precise (non-null)
      pageNumbers: enrichedPages.length > 0 ? enrichedPages : c.pageNumbers,
      // Upgrade heading hint if structured heading text is cleaner
      sectionHeadingHint: c.sectionHeadingHint ?? structured.headingText,
      // Structured source boosts confidence slightly
      confidence: Math.min(1, Math.max(c.confidence, structured.score)),
    };
  });

  // Add any types found by structured headings that were NOT in existing candidates
  const existingTypes = new Set(existingCandidates.map((c) => c.type));
  for (const [type, structured] of byType.entries()) {
    if (!existingTypes.has(type)) {
      const rawPages = [structured.page];
      const pageNumbers = buildPageRange(rawPages, totalPages ?? structuredResult.totalPages ?? null);
      result.push({
        type,
        label: structured.label,
        confidence: structured.score,
        publishable: structured.publishable,
        sectionHeadingHint: structured.headingText,
        pageRangeHint: null,
        sensitivityHint: structured.sensitivityHint ?? null,
        charOffsetHint: null,
        pageNumbers: pageNumbers.length > 0 ? pageNumbers : null,
      });
    }
  }

  return result;
}

/**
 * Build a set of heading strings from structured data heading blocks.
 * Used to enrich `bundleHint.sectionHeadings` with more precise heading text
 * than what markdown parsing can provide.
 */
export function extractStructuredHeadingStrings(
  structuredResult: AdobeStructuredResult | null | undefined,
  maxHeadings = 6,
): string[] {
  if (!structuredResult?.ok) return [];
  const headings = structuredResult.allBlocks
    .filter((b) => b.isHeading && b.text.trim().length > 3)
    .map((b) => b.text.trim())
    // Deduplicate
    .filter((h, i, arr) => arr.indexOf(h) === i)
    .slice(0, maxHeadings);
  return headings;
}
