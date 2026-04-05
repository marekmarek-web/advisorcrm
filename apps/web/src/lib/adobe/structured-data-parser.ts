/**
 * Adobe PDF Services Extract API — structuredData.json parser.
 *
 * Adobe Extract returns a ZIP containing `structuredData.json` with a top-level
 * `elements` array. Each element has:
 *   - `Text`  (string)  — the element's text content
 *   - `Page`  (number)  — 0-based page index
 *   - `Path`  (string)  — structural path, e.g. "//Document/H1", "//Document/Sect/P"
 *   - `Bounds` ([x1,y1,x2,y2] or {x,y,width,height}) — bounding box
 *   - lowercase aliases (`text`, `page`, `path`, `bounds`) — some response versions
 *
 * This module provides:
 *  - `parseAdobeStructuredData(jsonText)` — parse JSON string → AdobeStructuredResult
 *  - `buildPageMapFromStructuredData(result)` — canonical page→text map (1-indexed)
 *  - `AdobeStructuredPage` — per-page structured summary
 */

// ─── Raw Adobe element types ──────────────────────────────────────────────────

/**
 * Raw element as returned by Adobe Extract API.
 * Adobe may use either camelCase or PascalCase field names depending on SDK version.
 */
export type AdobeRawElement = {
  // PascalCase (primary Adobe API format)
  Text?: string;
  Page?: number;
  Path?: string;
  Bounds?: [number, number, number, number] | { x: number; y: number; width: number; height: number };
  // Lowercase aliases (some SDK versions / ZIP formats)
  text?: string;
  page?: number;
  path?: string;
  bounds?: [number, number, number, number] | { x: number; y: number; width: number; height: number };
  // Nested elements
  kids?: AdobeRawElement[];
  children?: AdobeRawElement[];
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AdobeRawStructuredData = {
  elements?: AdobeRawElement[];
  pages?: unknown[];
  [key: string]: unknown;
};

// ─── Canonical parsed types ───────────────────────────────────────────────────

/**
 * A single block of text extracted from an Adobe element.
 * Includes structural context for section detection.
 */
export type AdobeStructuredBlock = {
  /** 1-based page number. */
  page: number;
  /** Text content of this element/block. */
  text: string;
  /**
   * Structural path (e.g. "//Document/H1", "//Document/Sect/P").
   * Can be used for heading detection and section boundary identification.
   */
  path: string | null;
  /** True if the path indicates a heading element (H1–H6). */
  isHeading: boolean;
};

/**
 * Per-page structured summary.
 */
export type AdobeStructuredPage = {
  /** 1-based page number. */
  pageNumber: number;
  /** All text from this page concatenated in reading order. */
  fullText: string;
  /** Individual blocks (for section-level sourcing). */
  blocks: AdobeStructuredBlock[];
};

/**
 * Canonical result of parsing structuredData.json.
 */
export type AdobeStructuredResult = {
  /** True if parsing succeeded and at least one element was found. */
  ok: boolean;
  /** Total number of pages found in the structured data. */
  totalPages: number;
  /** Per-page summaries, keyed by 1-based page number. */
  pages: Record<number, AdobeStructuredPage>;
  /** All blocks across all pages (for cross-page section detection). */
  allBlocks: AdobeStructuredBlock[];
  /** Reason for failure, if ok=false. */
  error?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveText(el: AdobeRawElement): string | null {
  const t = el.Text ?? el.text;
  return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
}

function resolvePage(el: AdobeRawElement): number | null {
  const p = el.Page ?? el.page;
  return typeof p === "number" && Number.isFinite(p) && p >= 0 ? p : null;
}

function resolvePath(el: AdobeRawElement): string | null {
  const p = el.Path ?? el.path;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
}

function isHeadingPath(path: string | null): boolean {
  if (!path) return false;
  return /\/H[1-6](\b|$|\[)/.test(path);
}

/**
 * Recursively flatten all text-bearing elements from the Adobe element tree.
 * Handles nested `kids` / `children` arrays.
 */
function flattenElements(elements: AdobeRawElement[]): AdobeRawElement[] {
  const result: AdobeRawElement[] = [];
  for (const el of elements) {
    const hasText = Boolean(resolveText(el));
    const hasPage = resolvePage(el) !== null;
    if (hasText && hasPage) {
      result.push(el);
    }
    const nested = el.kids ?? el.children ?? [];
    if (nested.length > 0) {
      result.push(...flattenElements(nested));
    }
  }
  return result;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse Adobe structuredData.json text into a canonical `AdobeStructuredResult`.
 *
 * @param jsonText  Raw text content of structuredData.json (from storage download).
 * @returns         Canonical result with per-page and per-block maps.
 */
export function parseAdobeStructuredData(jsonText: string): AdobeStructuredResult {
  const empty: AdobeStructuredResult = {
    ok: false,
    totalPages: 0,
    pages: {},
    allBlocks: [],
  };

  if (!jsonText?.trim()) {
    return { ...empty, error: "empty_input" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ...empty, error: "invalid_json" };
  }

  if (!raw || typeof raw !== "object") {
    return { ...empty, error: "not_object" };
  }

  const data = raw as AdobeRawStructuredData;
  const elements = data.elements;

  if (!Array.isArray(elements) || elements.length === 0) {
    return { ...empty, error: "no_elements" };
  }

  const flat = flattenElements(elements);
  if (flat.length === 0) {
    return { ...empty, error: "no_text_elements" };
  }

  const pageMap: Record<number, AdobeStructuredPage> = {};
  const allBlocks: AdobeStructuredBlock[] = [];

  for (const el of flat) {
    const rawPage = resolvePage(el);
    if (rawPage === null) continue;
    const page = rawPage + 1; // Convert 0-based → 1-based

    const text = resolveText(el);
    if (!text) continue;

    const path = resolvePath(el);
    const block: AdobeStructuredBlock = {
      page,
      text,
      path,
      isHeading: isHeadingPath(path),
    };

    allBlocks.push(block);

    if (!pageMap[page]) {
      pageMap[page] = { pageNumber: page, fullText: "", blocks: [] };
    }
    pageMap[page].blocks.push(block);
    pageMap[page].fullText = pageMap[page].fullText
      ? `${pageMap[page].fullText}\n${text}`
      : text;
  }

  const totalPages = Object.keys(pageMap).length;
  if (totalPages === 0) {
    return { ...empty, error: "no_pages_extracted" };
  }

  return {
    ok: true,
    totalPages,
    pages: pageMap,
    allBlocks,
  };
}

/**
 * Build a canonical `Record<number, string>` page text map from structured data.
 * Compatible with `buildPageTextMapFromMarkdown` output format — can be passed
 * directly to `sliceSectionText` / `sliceSectionTextForType`.
 */
export function buildPageMapFromStructuredData(
  result: AdobeStructuredResult,
): Record<number, string> {
  if (!result.ok || result.totalPages === 0) return {};
  const map: Record<number, string> = {};
  for (const [pageNum, page] of Object.entries(result.pages)) {
    map[Number(pageNum)] = page.fullText;
  }
  return map;
}

/**
 * Extract the text of a specific page range from structured data.
 * Pages are 1-indexed.
 */
export function extractPageRangeText(
  result: AdobeStructuredResult,
  startPage: number,
  endPage: number,
): string {
  const texts: string[] = [];
  for (let p = startPage; p <= endPage; p++) {
    const page = result.pages[p];
    if (page?.fullText) texts.push(page.fullText);
  }
  return texts.join("\n\n");
}

/**
 * Find pages containing a keyword (case-insensitive).
 * Returns sorted 1-based page numbers.
 */
export function findPagesContaining(
  result: AdobeStructuredResult,
  keyword: string,
): number[] {
  const lower = keyword.toLowerCase();
  const pages: number[] = [];
  for (const [pageNum, page] of Object.entries(result.pages)) {
    if (page.fullText.toLowerCase().includes(lower)) {
      pages.push(Number(pageNum));
    }
  }
  return pages.sort((a, b) => a - b);
}
