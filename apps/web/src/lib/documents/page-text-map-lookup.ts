/**
 * DB lookup for per-page text maps.
 *
 * The documents table stores a `pageTextMap` (JSONB column) that is populated during
 * document processing (processDocument in orchestrator.ts). The AI Review pipeline
 * can read this instead of rebuilding the map heuristically from markdown.
 *
 * Priority for review pipeline:
 *   1. DB-backed pageTextMap (built from Adobe-normalized markdown with numbered markers)
 *   2. Rebuild from current markdown (buildPageTextMapFromMarkdown — may detect standalone ---)
 *   3. Single-page fallback (entire text = page 1)
 */

import { db, documents, eq } from "db";

export type PageTextMapLookupResult = {
  pageTextMap: Record<number, string> | null;
  /** How the map was sourced — for traceability in sourceModeTrace. */
  source: "db_stored" | "not_found" | "db_error";
  /** Number of pages in the map (0 if not found). */
  pageCount: number;
};

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

/**
 * Resolves the best available pageTextMap for a document in the review pipeline.
 *
 * Priority:
 *   1. `storedMap` (from DB lookup) — if multi-page (>1 entries)
 *   2. `markdownMap` (built from markdown) — if multi-page
 *   3. null (caller should fall back to full-text)
 *
 * Also returns a trace string describing the winning source.
 */
export function resolvePageTextMap(
  storedMap: PageTextMapLookupResult,
  markdownMap: Record<number, string>,
  markdownMapSource: string,
): {
  pageTextMap: Record<number, string> | null;
  traceSource: "db_stored" | "markdown_numbered_markers" | "markdown_standalone_dashes" | "markdown_form_feed" | "heuristic_fallback";
} {
  // 1. Prefer DB-stored map if it has real page data
  if (storedMap.pageTextMap && storedMap.pageCount > 1) {
    return { pageTextMap: storedMap.pageTextMap, traceSource: "db_stored" };
  }

  // 2. Use markdown-derived map if it has real page separation
  if (Object.keys(markdownMap).length > 1) {
    const src = markdownMapSource === "numbered_markers"
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
