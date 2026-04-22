/**
 * Server-side helper: render a single PDF page to a base64-encoded JPEG data URL.
 *
 * Used by AI Review page-image fallback — when primary text/file extraction leaves
 * a required field empty or low-confidence, the pipeline re-runs just that field
 * against the corresponding rasterized page via the multimodal `input_image` API.
 *
 * Implementation: pdfjs-dist legacy build + @napi-rs/canvas (both already in deps
 * for other server-side pdf tasks). An in-process LRU-style cache avoids rendering
 * the same page twice per pipeline run.
 *
 * We DO NOT persist rasterized pages to Supabase storage in v1 — keeps the module
 * standalone + observable. If page-image fallback becomes hot, lift the cache into
 * Supabase storage under `ai-review-page-cache/{docId}/{page}.jpg`.
 */
import "server-only";

import { installPdfJsNodePolyfills } from "../documents/processing/pdfjs-node-polyfills";

type PdfJsViewport = {
  width: number;
  height: number;
};

type PdfJsRenderTask = {
  promise: Promise<void>;
};

type PdfJsPageLike = {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (opts: { canvasContext: unknown; viewport: PdfJsViewport }) => PdfJsRenderTask;
  cleanup: () => void;
};

type PdfJsDocumentLike = {
  numPages: number;
  getPage: (pageIndex: number) => Promise<PdfJsPageLike>;
  destroy: () => Promise<void>;
};

export type RasterizePageResult = {
  /** `data:image/jpeg;base64,…` — accepted directly by the multimodal OpenAI API. */
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
};

const FETCH_TIMEOUT_MS = 20_000;
/** Upper bound so giant books don't DoS a Fluid invocation. */
const MAX_PAGE_FOR_RASTERIZE = 60;
/** Rendering scale (72 DPI base × 2 ≈ 144 DPI, adequate for LLM vision at reasonable size). */
const DEFAULT_SCALE = 2;
/** JPEG quality 0–100 for @napi-rs/canvas. 82 is a good balance for scans. */
const DEFAULT_JPEG_QUALITY = 82;

/** Cache key: `${pdfUrl}::${pageIndex}::${scale}`. Value: data URL. */
const pageCache = new Map<string, RasterizePageResult>();
const MAX_CACHE_ENTRIES = 32;

function cacheKey(fileUrl: string, pageIndex: number, scale: number): string {
  return `${fileUrl}::${pageIndex}::${scale}`;
}

function rememberCached(key: string, value: RasterizePageResult): void {
  if (pageCache.size >= MAX_CACHE_ENTRIES) {
    const first = pageCache.keys().next().value;
    if (first !== undefined) pageCache.delete(first);
  }
  pageCache.set(key, value);
}

async function fetchPdfBytes(fileUrl: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(fileUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`PDF fetch failed: ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    clearTimeout(tid);
  }
}

export type RasterizePageOptions = {
  scale?: number;
  jpegQuality?: number;
};

/**
 * Render 1-indexed `pageNumber` from the PDF at `fileUrl` to a base64 JPEG data URL.
 *
 * Returns `null` when:
 * - page number is out of range,
 * - @napi-rs/canvas is unavailable on the runtime (very old/minimal lambda),
 * - any stage throws — caller should degrade gracefully (fallback stays no-op).
 */
export async function rasterizePdfPageToDataUrl(
  fileUrl: string,
  pageNumber: number,
  options: RasterizePageOptions = {}
): Promise<RasterizePageResult | null> {
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGE_FOR_RASTERIZE) {
    return null;
  }
  const scale = options.scale ?? DEFAULT_SCALE;
  const quality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const key = cacheKey(fileUrl, pageNumber, scale);
  const cached = pageCache.get(key);
  if (cached) return cached;

  await installPdfJsNodePolyfills();

  let canvasModule: typeof import("@napi-rs/canvas");
  try {
    canvasModule = await import("@napi-rs/canvas");
  } catch (e) {
    console.warn("[pdf-page-rasterize] @napi-rs/canvas unavailable", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }

  let doc: PdfJsDocumentLike | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await fetchPdfBytes(fileUrl);
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    doc = (await task.promise) as PdfJsDocumentLike;

    if (pageNumber > doc.numPages) {
      return null;
    }

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));

    const canvas = canvasModule.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    // White background — pdfjs renders transparent pixels for empty regions
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    await page.render({ canvasContext: ctx as unknown, viewport }).promise;
    page.cleanup();

    const jpegBuffer = await canvas.encode("jpeg", quality);
    const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;

    const result: RasterizePageResult = {
      dataUrl,
      width,
      height,
      pageNumber,
    };
    rememberCached(key, result);
    return result;
  } catch (e) {
    console.warn("[pdf-page-rasterize] render failed", {
      fileUrl: fileUrl.slice(0, 80),
      pageNumber,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  } finally {
    if (doc) {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Exposed for tests: clears the in-process cache. */
export function __clearPdfPageRasterizeCacheForTests(): void {
  pageCache.clear();
}
