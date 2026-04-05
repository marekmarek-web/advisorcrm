/**
 * Section Text Slicer
 *
 * Narrows the full document markdown text to the relevant portion for a given
 * PacketSubdocumentCandidate. This ensures focused extraction passes (health,
 * investment, AML, etc.) work against the actual section text rather than the
 * full bundle — improving evidence fidelity and avoiding cross-section bleed.
 *
 * Slicing strategies (tried in order, first success wins):
 * 1. Heading-based:    find sectionHeadingHint in text → extract to next major boundary
 * 2. Char-offset:      use charOffsetHint.start → expand forward to next boundary
 * 3. Page-range:       estimate chars/page from pageRangeHint + total text length
 * 4. Full text:        fallback — return unchanged (no narrowing possible)
 *
 * The returned SectionTextWindow carries:
 * - text:        the narrowed text (or full text if no narrowing possible)
 * - method:      which strategy was used
 * - startOffset: character offset of window start in original text
 * - endOffset:   character offset of window end in original text
 * - narrowed:    true when the window is a genuine subset of the full text
 */

import type { PacketSubdocumentCandidate } from "./document-packet-types";
import type { AdobeStructuredResult } from "@/lib/adobe/structured-data-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionTextMethod =
  | "adobe_structured_pages" // page text from Adobe Extract structuredData.json (highest)
  | "exact_pages"            // page text from pageTextMap (numbered markers / DB)
  | "heading"                // substring isolated by section heading
  | "char_offset"            // substring by char offset
  | "page_range"             // estimated char slice from pageRangeHint
  | "full_text";             // fallback: entire document text

export interface SectionTextWindow {
  /** Narrowed text for the section (may equal full text when narrowing fails). */
  text: string;
  /** Strategy used to produce this window. */
  method: SectionTextMethod;
  /** Start character offset in the original document text. */
  startOffset: number;
  /** End character offset in the original document text. */
  endOffset: number;
  /** True when window covers < 90% of the original text. */
  narrowed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum characters to include in a narrowed section window. Keeps prompts lean. */
const MAX_SECTION_CHARS = 18_000;

/** Minimum section length — if slice would be shorter, fall back to full text. */
const MIN_SECTION_CHARS = 400;

/**
 * Patterns that mark a "major boundary" (next section start).
 * When searching forward from a section start, stop at the first match.
 */
const MAJOR_BOUNDARY_PATTERNS: RegExp[] = [
  // Numbered section headings: "2.", "3.", "II.", etc.
  /^\s{0,4}(?:\d{1,2}\.|[IVX]{1,4}\.)\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/m,
  // All-caps Czech headings on their own line (≥6 chars)
  /^\s{0,4}[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{6,}/m,
  // Markdown h2/h3 headings
  /^#{2,3}\s+/m,
  // Horizontal rules / page separators
  /^[-─═]{5,}$/m,
  // Adobe Extract page-break markers
  /\f|---\s*\n|<page[-_]break\s*\/>/,
  // Czech section labels known to start new subdocuments
  /^\s{0,4}(?:zdravotní\s+dotazník|AML\s+formulář|platební\s+instrukce|pojistná\s+smlouva|prohlášení\s+pojistníka)/im,
];

// ─── Page text map utility ────────────────────────────────────────────────────

/**
 * Build a page-keyed text map from a markdown string that contains page-break markers.
 * Page-break patterns recognized: "--- page N ---", form-feed (\f), "<!-- page N -->".
 * If no markers exist (single-page or plain text), returns { 1: markdownContent }.
 *
 * This replicates the logic in documents/processing/orchestrator.ts and is the shared
 * source of truth for page-level text isolation.
 */
/**
 * Marker source info returned alongside the page text map.
 * Used for source mode traceability.
 */
export type PageTextMapSource =
  | "adobe_structured"   // from Adobe Extract structuredData.json (highest fidelity)
  | "numbered_markers"   // `--- page N ---` markers (canonical, from normalizeMarkdownPageBreaks)
  | "form_feed"          // \f form-feed characters
  | "html_comment"       // <!-- page N --> markers
  | "standalone_dashes"  // `---` standalone lines (legacy Adobe output, unnumbered)
  | "single_page";       // no page breaks found, entire text = page 1

export function buildPageTextMapFromMarkdown(
  markdownContent: string | null | undefined,
  pageCount?: number | null,
): Record<number, string>;
export function buildPageTextMapFromMarkdown(
  markdownContent: string | null | undefined,
  pageCount: number | null | undefined,
  returnSource: true,
): { map: Record<number, string>; source: PageTextMapSource };
export function buildPageTextMapFromMarkdown(
  markdownContent: string | null | undefined,
  pageCount?: number | null,
  returnSource?: true,
): Record<number, string> | { map: Record<number, string>; source: PageTextMapSource } {
  const ret = (map: Record<number, string>, source: PageTextMapSource) =>
    returnSource ? { map, source } : map;

  if (!markdownContent) return ret({}, "single_page");

  // Strategy 1: numbered `--- page N ---` markers (canonical — set by normalizeMarkdownPageBreaks)
  if (/---\s*page\s*\d+\s*---/i.test(markdownContent)) {
    const pattern = /(?:---\s*page\s*\d+\s*---)/gi;
    const parts = markdownContent.split(pattern).filter((p) => p.trim().length > 0);
    if (parts.length > 1) {
      const map: Record<number, string> = {};
      for (let i = 0; i < parts.length; i++) map[i + 1] = parts[i].trim();
      return ret(map, "numbered_markers");
    }
  }

  // Strategy 2: HTML comment markers <!-- page N -->
  if (/<!--\s*page\s*\d+\s*-->/i.test(markdownContent)) {
    const pattern = /<!--\s*page\s*\d+\s*-->/gi;
    const parts = markdownContent.split(pattern).filter((p) => p.trim().length > 0);
    if (parts.length > 1) {
      const map: Record<number, string> = {};
      for (let i = 0; i < parts.length; i++) map[i + 1] = parts[i].trim();
      return ret(map, "html_comment");
    }
  }

  // Strategy 3: form-feed characters (\f)
  if (markdownContent.includes("\f")) {
    const parts = markdownContent.split(/\f/).filter((p) => p.trim().length > 0);
    if (parts.length > 1) {
      const map: Record<number, string> = {};
      for (let i = 0; i < parts.length; i++) map[i + 1] = parts[i].trim();
      return ret(map, "form_feed");
    }
  }

  // Strategy 4: standalone `---` on its own line (legacy Adobe output before normalization).
  // Only use this when we have a plausible page count to validate against (avoid splitting
  // on decorative horizontal rules in single-page or low-page documents).
  const standaloneBreaks = (markdownContent.match(/^---\s*$/gm) ?? []).length;
  const plausiblePages = pageCount ?? 0;
  if (standaloneBreaks > 0 && (plausiblePages > 1 || standaloneBreaks <= 20)) {
    const parts = markdownContent.split(/^---\s*$/m).filter((p) => p.trim().length > 0);
    if (parts.length > 1) {
      const map: Record<number, string> = {};
      for (let i = 0; i < parts.length; i++) map[i + 1] = parts[i].trim();
      return ret(map, "standalone_dashes");
    }
  }

  // Fallback: single page
  return ret({ 1: markdownContent }, "single_page");
}

/**
 * Concatenate page text for a given set of page numbers from the map.
 * Missing pages are silently skipped.
 */
export function concatPagesFromMap(
  pageTextMap: Record<number, string>,
  pageNumbers: number[],
): string {
  return pageNumbers
    .filter((p) => p in pageTextMap)
    .map((p) => pageTextMap[p])
    .join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the next major section boundary in `text` after `startOffset`.
 * Returns the index of the boundary, or text.length if none found.
 * Searches at most `searchWindow` characters ahead to avoid O(n²) behaviour.
 */
function findNextMajorBoundary(text: string, startOffset: number, searchWindow = 25_000): number {
  const searchArea = text.slice(startOffset, startOffset + searchWindow);
  let earliest = searchArea.length;
  for (const pat of MAJOR_BOUNDARY_PATTERNS) {
    const re = new RegExp(pat.source, pat.flags.includes("m") ? pat.flags : pat.flags + "m");
    const m = re.exec(searchArea);
    if (m && m.index > 100 && m.index < earliest) {
      // Require at least 100 chars before the boundary to avoid single-line matches
      earliest = m.index;
    }
  }
  return startOffset + earliest;
}

/**
 * Find the position of a heading/text hint within `text` (case-insensitive).
 * Returns the character index, or null if not found.
 */
function findHintPosition(text: string, hint: string): number | null {
  const needle = hint
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "\\s+");
  const re = new RegExp(needle, "i");
  const m = re.exec(
    text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""),
  );
  return m ? m.index : null;
}

/**
 * Attempt heading-based slice.
 * Scans backward from the hint position to capture the full heading line,
 * then slices forward to the next major boundary.
 */
function sliceByHeading(fullText: string, headingHint: string): SectionTextWindow | null {
  const pos = findHintPosition(fullText, headingHint);
  if (pos === null) return null;

  // Walk backward to start of the heading line
  const lineStart = fullText.lastIndexOf("\n", pos - 1) + 1;
  const end = Math.min(findNextMajorBoundary(fullText, lineStart), lineStart + MAX_SECTION_CHARS);

  if (end - lineStart < MIN_SECTION_CHARS) return null;

  return {
    text: fullText.slice(lineStart, end),
    method: "heading",
    startOffset: lineStart,
    endOffset: end,
    narrowed: end - lineStart < fullText.length * 0.9,
  };
}

/**
 * Attempt char-offset-based slice.
 * Expands the candidate's charOffsetHint.start backward to a line boundary,
 * then forward to the next major boundary.
 */
function sliceByCharOffset(fullText: string, charOffset: { start: number; end: number }): SectionTextWindow | null {
  const lineStart = fullText.lastIndexOf("\n", charOffset.start - 1) + 1;
  const end = Math.min(findNextMajorBoundary(fullText, lineStart), lineStart + MAX_SECTION_CHARS);

  if (end - lineStart < MIN_SECTION_CHARS) return null;

  return {
    text: fullText.slice(lineStart, end),
    method: "char_offset",
    startOffset: lineStart,
    endOffset: end,
    narrowed: end - lineStart < fullText.length * 0.9,
  };
}

/**
 * Attempt page-range-based slice.
 * Parses "5-12", "~9+", "3-" style hints and estimates char offsets.
 * Uses total text length and estimated total pages to calculate chars-per-page.
 */
function sliceByPageRange(
  fullText: string,
  pageRangeHint: string,
  estimatedTotalPages: number,
): SectionTextWindow | null {
  // Parse hint formats: "5-12", "~9+", "5+", "3-8"
  const m = pageRangeHint.replace(/~/g, "").match(/^(\d+)(?:[-+](\d+))?/);
  if (!m) return null;

  const startPage = parseInt(m[1], 10);
  const endPage = m[2] ? parseInt(m[2], 10) : startPage + 5; // default 5-page window

  if (startPage <= 0 || estimatedTotalPages <= 0) return null;

  const charsPerPage = fullText.length / estimatedTotalPages;
  const startOffset = Math.max(0, Math.floor((startPage - 1) * charsPerPage) - 200);
  const endOffset = Math.min(fullText.length, Math.ceil(endPage * charsPerPage) + 200);

  if (endOffset - startOffset < MIN_SECTION_CHARS) return null;

  const sliced = fullText.slice(startOffset, Math.min(endOffset, startOffset + MAX_SECTION_CHARS));
  return {
    text: sliced,
    method: "page_range",
    startOffset,
    endOffset: startOffset + sliced.length,
    narrowed: sliced.length < fullText.length * 0.9,
  };
}

/**
 * Slice text using Adobe Extract structuredData.json per-page content.
 * This is the highest-fidelity strategy — uses actual structural block text,
 * not markdown-derived content.
 *
 * Requires:
 * - candidate.pageNumbers is non-empty
 * - structuredResult.pages has entries for those page numbers
 */
function sliceByAdobeStructuredPages(
  candidate: PacketSubdocumentCandidate,
  structuredResult: AdobeStructuredResult,
): SectionTextWindow | null {
  const pages = candidate.pageNumbers;
  if (!pages || pages.length === 0) return null;
  if (!structuredResult.ok || structuredResult.totalPages === 0) return null;

  const availablePages = pages.filter((p) => p in structuredResult.pages);
  if (availablePages.length === 0) return null;

  const textParts: string[] = [];
  for (const p of availablePages) {
    const page = structuredResult.pages[p];
    if (page?.fullText) textParts.push(page.fullText);
  }

  const text = textParts.join("\n\n").trim();
  if (text.length < 20) return null;

  const truncated = text.slice(0, MAX_SECTION_CHARS);
  const totalStructuredLength = Object.values(structuredResult.pages)
    .map((p) => p.fullText.length)
    .reduce((a, b) => a + b, 0);

  return {
    text: truncated,
    method: "adobe_structured_pages",
    startOffset: -1,
    endOffset: -1,
    narrowed: truncated.length < totalStructuredLength * 0.9,
  };
}

/**
 * Attempt exact page-based slice using a pre-built pageTextMap.
 * This is the highest-fidelity strategy: uses the actual physical page text
 * rather than a heuristic substring.
 *
 * Requires:
 * - candidate.pageNumbers is non-empty
 * - pageTextMap has entries for those pages
 * - The concatenated text meets the minimum length threshold
 */
function sliceByPageNumbers(
  candidate: PacketSubdocumentCandidate,
  pageTextMap: Record<number, string>,
): SectionTextWindow | null {
  const pages = candidate.pageNumbers;
  if (!pages || pages.length === 0) return null;

  const availablePages = pages.filter((p) => p in pageTextMap);
  if (availablePages.length === 0) return null;

  const text = concatPagesFromMap(pageTextMap, availablePages);
  // Use a lower minimum for exact pages: we trust the page selection even for short sections.
  if (text.trim().length < 20) return null;

  const truncated = text.slice(0, MAX_SECTION_CHARS);
  const totalMapLength = Object.values(pageTextMap).join("").length;

  return {
    text: truncated,
    method: "exact_pages",
    startOffset: -1, // offset not meaningful for page-level slicing
    endOffset: -1,
    narrowed: truncated.length < totalMapLength * 0.9,
  };
}

// ─── Estimate total pages from text ──────────────────────────────────────────

function estimatePageCountFromText(text: string): number {
  const pageBreakMatches = (text.match(/---\s*\n|<page[-_]break\s*\/>|\f/g) ?? []).length;
  if (pageBreakMatches > 0) return pageBreakMatches + 1;
  const stranaMatches = text.match(/strana\s+\d+\s+z\s+(\d+)/gi) ?? [];
  for (const sm of stranaMatches) {
    const nm = sm.match(/z\s+(\d+)/i);
    if (nm) return parseInt(nm[1], 10);
  }
  // Rough fallback: ~3200 chars per page
  return Math.max(1, Math.round(text.length / 3200));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the narrowed text window for a given candidate section.
 *
 * Priority order (highest → lowest):
 *   1. adobe_structured_pages — per-page text from Adobe Extract structuredData.json
 *   2. exact_pages  — physical page slices from pageTextMap (if pageNumbers + map available)
 *   3. heading      — heading-based substring from full markdown
 *   4. char_offset  — character offset from signal match location
 *   5. page_range   — estimated char slice from pageRangeHint + total pages
 *   6. full_text    — fallback: full markdown (no narrowing)
 *
 * @param fullText        The complete markdown text of the document.
 * @param candidate       The detected subdocument candidate.
 * @param totalPages      Optional total page count (from preprocess meta).
 * @param pageTextMap     Optional physical page-level text map (key = 1-indexed page number).
 * @param structuredResult Optional Adobe Extract parsed structured data (highest priority).
 */
export function sliceSectionText(
  fullText: string,
  candidate: PacketSubdocumentCandidate,
  totalPages?: number | null,
  pageTextMap?: Record<number, string> | null,
  structuredResult?: AdobeStructuredResult | null,
): SectionTextWindow {
  const fallback: SectionTextWindow = {
    text: fullText.slice(0, MAX_SECTION_CHARS * 2),
    method: "full_text",
    startOffset: 0,
    endOffset: Math.min(fullText.length, MAX_SECTION_CHARS * 2),
    narrowed: false,
  };

  // Strategy 0a (highest): Adobe Extract structuredData.json per-page text
  if (structuredResult?.ok && structuredResult.totalPages > 1) {
    const result = sliceByAdobeStructuredPages(candidate, structuredResult);
    if (result?.narrowed) return result;
  }

  // Strategy 0b: exact page-level isolation from pageTextMap.
  // Checked BEFORE the min-length guard because physical page isolation is always reliable
  // regardless of total document length.
  if (pageTextMap && Object.keys(pageTextMap).length > 1) {
    const result = sliceByPageNumbers(candidate, pageTextMap);
    if (result?.narrowed) return result;
  }

  if (fullText.length < MIN_SECTION_CHARS) return fallback;

  // Strategy 1: heading-based
  if (candidate.sectionHeadingHint) {
    const result = sliceByHeading(fullText, candidate.sectionHeadingHint);
    if (result?.narrowed) return result;
  }

  // Strategy 2: char offset
  if (candidate.charOffsetHint) {
    const result = sliceByCharOffset(fullText, candidate.charOffsetHint);
    if (result?.narrowed) return result;
  }

  // Strategy 3: page range
  if (candidate.pageRangeHint) {
    const pages = totalPages ?? estimatePageCountFromText(fullText);
    const result = sliceByPageRange(fullText, candidate.pageRangeHint, pages);
    if (result?.narrowed) return result;
  }

  return fallback;
}

/**
 * Slices all candidates of a given type and returns the union of their windows.
 * When multiple candidates of the same type exist (e.g. multiple health sections),
 * their windows are merged into one contiguous range.
 *
 * @param fullText        The complete markdown text.
 * @param candidates      All detected subdocument candidates.
 * @param type            The candidate type to slice for.
 * @param totalPages      Optional total page count.
 * @param pageTextMap     Optional physical page-level text map for exact_pages isolation.
 * @param structuredResult Optional Adobe Extract structured result (highest priority).
 */
export function sliceSectionTextForType(
  fullText: string,
  candidates: PacketSubdocumentCandidate[],
  type: PacketSubdocumentCandidate["type"],
  totalPages?: number | null,
  pageTextMap?: Record<number, string> | null,
  structuredResult?: AdobeStructuredResult | null,
): SectionTextWindow {
  const matching = candidates.filter((c) => c.type === type);
  if (matching.length === 0) {
    return {
      text: fullText.slice(0, MAX_SECTION_CHARS * 2),
      method: "full_text",
      startOffset: 0,
      endOffset: Math.min(fullText.length, MAX_SECTION_CHARS * 2),
      narrowed: false,
    };
  }

  if (matching.length === 1) {
    return sliceSectionText(fullText, matching[0], totalPages, pageTextMap, structuredResult);
  }

  // Multiple candidates: try adobe_structured_pages first by merging all page numbers
  if (structuredResult?.ok && structuredResult.totalPages > 1) {
    const allPages = [...new Set(matching.flatMap((c) => c.pageNumbers ?? []))].sort((a, b) => a - b);
    if (allPages.length > 0) {
      const syntheticCandidate: PacketSubdocumentCandidate = { ...matching[0], pageNumbers: allPages };
      const result = sliceByAdobeStructuredPages(syntheticCandidate, structuredResult);
      if (result?.narrowed) return result;
    }
  }

  // Multiple candidates: try exact_pages by merging all page numbers
  if (pageTextMap && Object.keys(pageTextMap).length > 1) {
    const allPages = [...new Set(matching.flatMap((c) => c.pageNumbers ?? []))].sort((a, b) => a - b);
    if (allPages.length > 0) {
      const syntheticCandidate: PacketSubdocumentCandidate = { ...matching[0], pageNumbers: allPages };
      const result = sliceByPageNumbers(syntheticCandidate, pageTextMap);
      if (result?.narrowed) return result;
    }
  }

  // Collect all windows and merge
  const windows = matching.map((c) => sliceSectionText(fullText, c, totalPages, pageTextMap, structuredResult));
  const narrowedWindows = windows.filter((w) => w.narrowed);

  if (narrowedWindows.length === 0) return windows[0];

  // For adobe_structured_pages windows, concatenate directly
  const adobeWindows = narrowedWindows.filter((w) => w.method === "adobe_structured_pages");
  if (adobeWindows.length > 0) {
    const combined = adobeWindows.map((w) => w.text).join("\n\n").slice(0, MAX_SECTION_CHARS);
    return {
      text: combined,
      method: "adobe_structured_pages",
      startOffset: -1,
      endOffset: -1,
      narrowed: true,
    };
  }

  // For exact_pages windows, concatenate texts directly (offsets are -1)
  const exactWindows = narrowedWindows.filter((w) => w.method === "exact_pages");
  if (exactWindows.length > 0) {
    const combined = exactWindows.map((w) => w.text).join("\n\n").slice(0, MAX_SECTION_CHARS);
    const totalMapLen = Object.values(pageTextMap ?? {}).join("").length;
    return {
      text: combined,
      method: "exact_pages",
      startOffset: -1,
      endOffset: -1,
      narrowed: combined.length < totalMapLen * 0.9,
    };
  }

  const minStart = Math.min(...narrowedWindows.map((w) => w.startOffset));
  const maxEnd = Math.min(
    Math.max(...narrowedWindows.map((w) => w.endOffset)),
    minStart + MAX_SECTION_CHARS,
  );

  return {
    text: fullText.slice(minStart, maxEnd),
    method: narrowedWindows[0].method,
    startOffset: minStart,
    endOffset: maxEnd,
    narrowed: maxEnd - minStart < fullText.length * 0.9,
  };
}

// ─── Source mode reporting ────────────────────────────────────────────────────

/**
 * Human-readable description of the isolation mode used.
 * Used for E2E golden validation output.
 */
export function describeSourceMode(window: SectionTextWindow): string {
  switch (window.method) {
    case "adobe_structured_pages": return "Adobe structured pages (structuredData.json)";
    case "exact_pages": return "exact page-level (pageTextMap)";
    case "heading":     return "section/heading slice";
    case "char_offset": return "char-offset slice";
    case "page_range":  return "page-range estimate";
    case "full_text":   return "full text fallback";
  }
}
