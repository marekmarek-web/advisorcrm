/**
 * Standalone Adobe preprocess helper for golden dataset eval harness.
 *
 * Unlike preprocessForAiExtraction (which requires Supabase storage + tenant context),
 * this module:
 *   - Calls the Adobe PDF Services API directly using env credentials
 *   - Caches results to disk (fixtures/golden-ai-review/preprocess-cache/)
 *   - Returns the same shape as PipelinePreprocessMeta + ruleBasedTextHint
 *   - Does NOT write to Supabase storage
 *
 * This enables C025 / C030 (scan-heavy docs) to run through the full AI Review v2 pipeline
 * in the eval harness without the Supabase context that production requires.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelinePreprocessMeta } from "../contract-understanding-pipeline";

const _evalDir = dirname(fileURLToPath(import.meta.url));
// __tests__(1) → ai(2) → lib(3) → src(4) → web(5) → apps(6) → repo root
const PREPROCESS_CACHE_DIR = resolve(_evalDir, "../../../../../../fixtures/golden-ai-review/preprocess-cache");

// Minimum chars from Adobe to be considered usable
const MIN_PREPROCESS_TEXT_CHARS = 400;

export type EvalPreprocessResult = {
  lifecycle: PipelinePreprocessMeta["preprocessStatus"];
  ruleBasedTextHint: string | null;
  preprocessMeta: PipelinePreprocessMeta;
  fromCache: boolean;
};

type CachedPreprocessEntry = {
  version: 1;
  documentId: string;
  preprocessedAt: string;
  lifecycle: string;
  markdownText: string | null;
  readabilityScore: number;
  ocrConfidenceEstimate: number;
  pageCountEstimate: number | null;
  textSizeChars: number;
  warnings: string[];
  preprocessDurationMs: number;
  errorCode?: string;
  errorMessage?: string;
};

function getCacheKey(pdfAbsPath: string): string {
  const content = readFileSync(pdfAbsPath);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function getCachePath(cacheKey: string): string {
  return join(PREPROCESS_CACHE_DIR, `${cacheKey}.json`);
}

function readFromCache(cacheKey: string): CachedPreprocessEntry | null {
  const cachePath = getCachePath(cacheKey);
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, "utf8")) as CachedPreprocessEntry;
  } catch {
    return null;
  }
}

function writeToCache(cacheKey: string, entry: CachedPreprocessEntry): void {
  mkdirSync(PREPROCESS_CACHE_DIR, { recursive: true });
  writeFileSync(getCachePath(cacheKey), JSON.stringify(entry, null, 2), "utf8");
}

async function runAdobeMarkdownOnBuffer(
  pdfBuffer: Buffer,
  docId: string
): Promise<{ ok: boolean; text: string | null; error?: string; jobId?: string; pageCount?: number }> {
  try {
    // Dynamically import to avoid loading Adobe SDK on non-eval paths
    const { getAccessToken, createAssetUpload, uploadAssetContent, submitPdfToMarkdownJob, pollJobResult, downloadResult, resolvePollDownloadUri } = await import("../../adobe/client");
    const { isZipBuffer, unzipFirstMarkdown } = await import("../../adobe/zip-helpers");
    const { normalizeMarkdownPageBreaks } = await import("../../documents/processing/adobe-provider");

    const token = await getAccessToken();

    const mediaType = "application/pdf";
    const asset = await createAssetUpload(token, mediaType);
    await uploadAssetContent(asset.uploadUri, pdfBuffer.buffer, mediaType);
    const assetId = asset.assetID;

    const pollUrl = await submitPdfToMarkdownJob(token, assetId);
    const result = await pollJobResult(token, pollUrl);
    const downloadUri = resolvePollDownloadUri(result);
    if (!downloadUri) {
      return { ok: false, error: "PDF-to-Markdown: no download URI returned" };
    }

    const rawBytes = await downloadResult(downloadUri);
    let textContent: string;
    if (isZipBuffer(rawBytes)) {
      const fromZip = await unzipFirstMarkdown(rawBytes);
      textContent = fromZip ?? new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
    } else {
      textContent = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
    }

    const { normalized } = normalizeMarkdownPageBreaks(textContent, null);
    textContent = normalized;

    // Estimate page count from page break markers
    const pageBreakMatches = textContent.match(/--- page \d+ ---/g);
    const pageCount = pageBreakMatches ? pageBreakMatches.length + 1 : null;

    return { ok: true, text: textContent, pageCount: pageCount ?? undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function estimateReadability(text: string | null): number {
  if (!text || text.trim().length === 0) return 0;
  const len = text.trim().length;
  if (len > 5000) return 90;
  if (len > 2000) return 80;
  if (len > 800) return 70;
  if (len > 400) return 55;
  return 30;
}

/**
 * Run Adobe PDF-to-Markdown on a local PDF file (scan-heavy doc) and cache the result.
 * Uses `GOLDEN_EVAL_ADOBE_PREPROCESS=1` env flag to enable.
 * Without the flag, returns `preprocess_required` (no API call).
 *
 * Cache behavior:
 * - Cache key = SHA256 of PDF bytes (content-addressed, not filename-based)
 * - Cache stored in fixtures/golden-ai-review/preprocess-cache/<key>.json
 * - Cache hit: returns `preprocess_reused_cached_result` without calling Adobe
 * - Cache miss + GOLDEN_EVAL_ADOBE_PREPROCESS=1: calls Adobe, stores result
 * - Cache miss + no flag: returns `preprocess_required` (eval skips without fail)
 */
export async function evalAdobePreprocess(
  pdfAbsPath: string,
  documentId: string
): Promise<EvalPreprocessResult> {
  // Read cache key first — cheap
  let cacheKey: string;
  try {
    cacheKey = getCacheKey(pdfAbsPath);
  } catch {
    return {
      lifecycle: "preprocess_failed",
      ruleBasedTextHint: null,
      fromCache: false,
      preprocessMeta: {
        preprocessStatus: "preprocess_failed",
        preprocessProvider: "eval_standalone",
        preprocessMode: "none",
        preprocessErrorCode: "pdf_read_failed",
        preprocessErrorMessage: `Cannot read PDF: ${pdfAbsPath}`,
        preprocessWarnings: ["pdf_read_failed"],
        adobePreprocessed: false,
      },
    };
  }

  // Check cache
  const cached = readFromCache(cacheKey);
  if (cached) {
    const lifecycle = cached.lifecycle as PipelinePreprocessMeta["preprocessStatus"];
    const ruleBasedTextHint =
      cached.markdownText && cached.markdownText.trim().length >= MIN_PREPROCESS_TEXT_CHARS
        ? cached.markdownText
        : null;
    return {
      lifecycle: "preprocess_reused_cached_result",
      ruleBasedTextHint,
      fromCache: true,
      preprocessMeta: {
        preprocessStatus: "preprocess_reused_cached_result",
        preprocessProvider: "eval_standalone",
        preprocessMode: "adobe",
        adobePreprocessed: lifecycle === "preprocess_succeeded",
        readabilityScore: cached.readabilityScore,
        ocrConfidenceEstimate: cached.ocrConfidenceEstimate,
        pageCountEstimate: cached.pageCountEstimate,
        markdownContentLength: cached.markdownText?.length ?? 0,
        preprocessTextSizeChars: cached.textSizeChars,
        preprocessDurationMs: cached.preprocessDurationMs,
        preprocessCacheSource: getCachePath(cacheKey),
        preprocessSourcePriority: "adobe_markdown_text",
        preprocessWarnings: cached.warnings,
        preprocessErrorCode: cached.errorCode,
        preprocessErrorMessage: cached.errorMessage,
      },
    };
  }

  // No cache — check if Adobe preprocess is enabled for eval
  const adobeEnabled = process.env.GOLDEN_EVAL_ADOBE_PREPROCESS === "1";
  if (!adobeEnabled) {
    return {
      lifecycle: "preprocess_required",
      ruleBasedTextHint: null,
      fromCache: false,
      preprocessMeta: {
        preprocessStatus: "preprocess_required",
        preprocessProvider: "eval_standalone",
        preprocessMode: "none",
        adobePreprocessed: false,
        preprocessWarnings: [
          "eval_adobe_preprocess_not_enabled: set GOLDEN_EVAL_ADOBE_PREPROCESS=1 to run Adobe preprocessing for this document",
        ],
        preprocessErrorCode: "eval_preprocess_not_enabled",
      },
    };
  }

  // Run Adobe
  const pdfBuffer = readFileSync(pdfAbsPath);
  const started = Date.now();
  const result = await runAdobeMarkdownOnBuffer(pdfBuffer, documentId);
  const preprocessDurationMs = Date.now() - started;

  if (!result.ok || !result.text) {
    const entry: CachedPreprocessEntry = {
      version: 1,
      documentId,
      preprocessedAt: new Date().toISOString(),
      lifecycle: "preprocess_failed",
      markdownText: null,
      readabilityScore: 0,
      ocrConfidenceEstimate: 0,
      pageCountEstimate: null,
      textSizeChars: 0,
      warnings: [result.error ?? "adobe_failed"],
      preprocessDurationMs,
      errorCode: "adobe_markdown_failed",
      errorMessage: result.error,
    };
    writeToCache(cacheKey, entry);
    return {
      lifecycle: "preprocess_failed",
      ruleBasedTextHint: null,
      fromCache: false,
      preprocessMeta: {
        preprocessStatus: "preprocess_failed",
        preprocessProvider: "eval_standalone",
        preprocessMode: "adobe",
        adobePreprocessed: false,
        preprocessDurationMs,
        preprocessErrorCode: "adobe_markdown_failed",
        preprocessErrorMessage: result.error,
        preprocessWarnings: [result.error ?? "adobe_failed"],
      },
    };
  }

  const text = result.text;
  const readabilityScore = estimateReadability(text);
  const entry: CachedPreprocessEntry = {
    version: 1,
    documentId,
    preprocessedAt: new Date().toISOString(),
    lifecycle: "preprocess_succeeded",
    markdownText: text,
    readabilityScore,
    ocrConfidenceEstimate: readabilityScore / 100,
    pageCountEstimate: result.pageCount ?? null,
    textSizeChars: text.trim().length,
    warnings: [],
    preprocessDurationMs,
  };
  writeToCache(cacheKey, entry);

  const ruleBasedTextHint = text.trim().length >= MIN_PREPROCESS_TEXT_CHARS ? text : null;

  return {
    lifecycle: "preprocess_succeeded",
    ruleBasedTextHint,
    fromCache: false,
    preprocessMeta: {
      preprocessStatus: "preprocess_succeeded",
      preprocessProvider: "eval_standalone",
      preprocessMode: "adobe",
      adobePreprocessed: true,
      readabilityScore,
      ocrConfidenceEstimate: readabilityScore / 100,
      pageCountEstimate: result.pageCount ?? null,
      markdownContentLength: text.length,
      preprocessTextSizeChars: text.trim().length,
      preprocessDurationMs,
      preprocessSourcePriority: "adobe_markdown_text",
      preprocessCacheSource: getCachePath(cacheKey),
      preprocessWarnings: [],
    },
  };
}
