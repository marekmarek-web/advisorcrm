/**
 * Server-side PDF text extraction when Adobe preprocessing is disabled or returns no text.
 * Uses pdf-parse (PDF.js). Musí načíst polyfilly dřív než `pdf-parse` — jinak pdfjs-dist na Node
 * vyhodí DOMMatrix is not defined (Vercel serverless).
 */
import "server-only";

import { installPdfJsNodePolyfills } from "./pdfjs-node-polyfills";

const FIRST_PAGES = 30;
/** Ignore tiny garbage strings (corrupt / empty PDF). */
const MIN_TEXT_CHARS = 40;
const PDF_FETCH_TIMEOUT_MS = 10_000;
const PDF_PARSE_TIMEOUT_MS = 10_000;

function buildTimeoutError(stage: "fetch" | "parse"): Error {
  return new Error(
    stage === "fetch"
      ? `PDF fetch timed out after ${PDF_FETCH_TIMEOUT_MS}ms`
      : `PDF parse timed out after ${PDF_PARSE_TIMEOUT_MS}ms`
  );
}

/**
 * Fetches a PDF from an HTTPS URL (e.g. Supabase signed URL) and extracts plain text from the first N pages.
 */
export async function extractTextFromPdfUrl(url: string): Promise<string | null> {
  await installPdfJsNodePolyfills();
  const { PDFParse } = await import("pdf-parse");

  let parser: InstanceType<typeof PDFParse> | null = null;
  let fetchTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let parseTimeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    fetchTimeoutId = setTimeout(() => controller.abort(buildTimeoutError("fetch")), PDF_FETCH_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`PDF fetch failed with status ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    clearTimeout(fetchTimeoutId);

    parser = new PDFParse({ data: Buffer.from(buffer) });
    const result = await Promise.race([
      parser.getText({ first: FIRST_PAGES }),
      new Promise<never>((_, reject) => {
        parseTimeoutId = setTimeout(() => reject(buildTimeoutError("parse")), PDF_PARSE_TIMEOUT_MS);
      }),
    ]);
    if (parseTimeoutId) clearTimeout(parseTimeoutId);
    const text = result.text?.trim() ?? "";
    return text.length >= MIN_TEXT_CHARS ? text : null;
  } catch (err) {
    console.warn("[pdf-text-fallback] extractTextFromPdfUrl failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
    if (parseTimeoutId) clearTimeout(parseTimeoutId);
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
