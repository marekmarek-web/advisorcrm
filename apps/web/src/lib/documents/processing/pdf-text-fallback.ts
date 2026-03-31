/**
 * Server-side PDF text extraction when Adobe preprocessing is disabled or returns no text.
 * Uses pdf-parse (PDF.js) so the AI pipeline gets a text hint instead of relying only on file_url vision.
 */

import "server-only";

import { PDFParse } from "pdf-parse";

const FIRST_PAGES = 30;
/** Ignore tiny garbage strings (corrupt / empty PDF). */
const MIN_TEXT_CHARS = 40;

/**
 * Fetches a PDF from an HTTPS URL (e.g. Supabase signed URL) and extracts plain text from the first N pages.
 */
export async function extractTextFromPdfUrl(url: string): Promise<string | null> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ url });
    const result = await parser.getText({ first: FIRST_PAGES });
    const text = result.text?.trim() ?? "";
    return text.length >= MIN_TEXT_CHARS ? text : null;
  } catch (err) {
    console.warn("[pdf-text-fallback] extractTextFromPdfUrl failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
