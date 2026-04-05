/**
 * DB lookup for per-page text maps and Adobe structured data.
 *
 * Priority for AI Review pipeline (highest → lowest):
 *   1. adobe_structured_pages — from Adobe Extract structuredData.json (highest fidelity)
 *   2. db_page_text_map       — JSONB from processDocument
 *   3. markdown_*             — rebuilt from markdown content
 *   4. heuristic_fallback     — single-page, entire text
 */

import { db, documents, eq } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import {
  parseAdobeStructuredData,
  buildPageMapFromStructuredData,
  type AdobeStructuredResult,
} from "@/lib/adobe/structured-data-parser";

export type PageTextMapLookupResult = {
  pageTextMap: Record<number, string> | null;
  /** How the map was sourced — for traceability in sourceModeTrace. */
  source: "db_stored" | "not_found" | "db_error";
  /** Number of pages in the map (0 if not found). */
  pageCount: number;
};

// ─── Adobe structured data lookup ────────────────────────────────────────────

export type AdobeStructuredLookupResult = {
  /** Parsed structured data result, or null if not available. */
  structured: AdobeStructuredResult | null;
  /** Pre-built page text map from structured data, or null. */
  pageTextMap: Record<number, string> | null;
  /** Source for traceability. */
  source: "adobe_structured" | "not_found" | "error";
  /** Number of pages extracted, 0 if not found. */
  pageCount: number;
};

/**
 * Download and parse Adobe Extract structuredData.json for a document.
 *
 * @param extractJsonPath  Storage path to the structuredData.json file.
 * @returns                Parsed structured result with page text map.
 */
export async function fetchAndParseStructuredData(
  extractJsonPath: string,
): Promise<AdobeStructuredLookupResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from("documents").download(extractJsonPath);
    if (error || !data) {
      return { structured: null, pageTextMap: null, source: "not_found", pageCount: 0 };
    }

    const jsonText = await data.text();
    const parsed = parseAdobeStructuredData(jsonText);

    if (!parsed.ok) {
      return { structured: null, pageTextMap: null, source: "not_found", pageCount: 0 };
    }

    const pageTextMap = buildPageMapFromStructuredData(parsed);
    return {
      structured: parsed,
      pageTextMap,
      source: "adobe_structured",
      pageCount: parsed.totalPages,
    };
  } catch {
    return { structured: null, pageTextMap: null, source: "error", pageCount: 0 };
  }
}

/**
 * Look up the document's extractJsonPath by storagePath, then download and parse the
 * Adobe structured data.
 *
 * This is the primary entry point for the AI Review pipeline.
 * Returns null result (not an error) when extractJsonPath isn't available for the document.
 */
export async function fetchAdobeStructuredDataByStoragePath(
  storagePath: string,
): Promise<AdobeStructuredLookupResult> {
  try {
    const rows = await db
      .select({ extractJsonPath: documents.extractJsonPath })
      .from(documents)
      .where(eq(documents.storagePath, storagePath))
      .limit(1);

    const extractJsonPath = rows[0]?.extractJsonPath;
    if (!extractJsonPath?.trim()) {
      return { structured: null, pageTextMap: null, source: "not_found", pageCount: 0 };
    }

    return fetchAndParseStructuredData(extractJsonPath);
  } catch {
    return { structured: null, pageTextMap: null, source: "error", pageCount: 0 };
  }
}

/**
 * Fetches the stored pageTextMap for a document identified by storagePath + tenantId.
 *
 * Uses `storagePath` as the join key because `run-contract-review-processing.ts` has
 * `storagePath` in params but not the internal `documentId`.
 *
 * Returns null map if:
 * - No matching document found
 * - Document has no stored pageTextMap (processing may not have run yet)
 * - DB error (fails silently — caller must fallback)
 */
export async function fetchPageTextMapByStoragePath(
  storagePath: string,
  tenantId: string,
): Promise<PageTextMapLookupResult> {
  try {
    const rows = await db
      .select({ pageTextMap: documents.pageTextMap })
      .from(documents)
      .where(eq(documents.storagePath, storagePath))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { pageTextMap: null, source: "not_found", pageCount: 0 };
    }

    const map = row.pageTextMap as Record<number, string> | null | undefined;
    if (!map || Object.keys(map).length === 0) {
      return { pageTextMap: null, source: "not_found", pageCount: 0 };
    }

    return {
      pageTextMap: map,
      source: "db_stored",
      pageCount: Object.keys(map).length,
    };
  } catch {
    return { pageTextMap: null, source: "db_error", pageCount: 0 };
  }
}

export type PageTextMapTraceSource =
  | "adobe_structured_pages"     // highest: from Adobe Extract structuredData.json
  | "db_stored"                  // from processDocument DB pageTextMap
  | "markdown_numbered_markers"  // --- page N --- markers
  | "markdown_standalone_dashes" // legacy Adobe --- without numbers
  | "markdown_form_feed"         // \f form-feed
  | "heuristic_fallback";        // single-page, no isolation possible

/**
 * Resolves the best available pageTextMap for a document in the review pipeline.
 *
 * Priority (highest → lowest):
 *   1. Adobe structured pages (from structuredData.json) — exact block/page sourcing
 *   2. DB-stored pageTextMap (from processDocument) — numbered markers or similar
 *   3. Markdown-derived map (numbered_markers > standalone_dashes > form_feed)
 *   4. null / heuristic_fallback
 *
 * Also returns a trace string describing the winning source.
 */
export function resolvePageTextMap(
  storedMap: PageTextMapLookupResult,
  markdownMap: Record<number, string>,
  markdownMapSource: string,
  adobeStructured?: AdobeStructuredLookupResult | null,
): {
  pageTextMap: Record<number, string> | null;
  traceSource: PageTextMapTraceSource;
  structuredResult?: AdobeStructuredResult | null;
} {
  // 1. Prefer Adobe structured data when multi-page (highest fidelity)
  if (adobeStructured?.pageTextMap && adobeStructured.pageCount > 1) {
    return {
      pageTextMap: adobeStructured.pageTextMap,
      traceSource: "adobe_structured_pages",
      structuredResult: adobeStructured.structured,
    };
  }

  // 2. DB-stored map if multi-page
  if (storedMap.pageTextMap && storedMap.pageCount > 1) {
    return { pageTextMap: storedMap.pageTextMap, traceSource: "db_stored" };
  }

  // 3. Markdown-derived map if multi-page
  if (Object.keys(markdownMap).length > 1) {
    const src: PageTextMapTraceSource =
      markdownMapSource === "numbered_markers"
        ? "markdown_numbered_markers"
        : markdownMapSource === "standalone_dashes"
        ? "markdown_standalone_dashes"
        : markdownMapSource === "form_feed"
        ? "markdown_form_feed"
        : "heuristic_fallback";
    return { pageTextMap: markdownMap, traceSource: src };
  }

  return { pageTextMap: null, traceSource: "heuristic_fallback" };
}
