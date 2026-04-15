/**
 * Extract filled AcroForm widget values from a PDF (server-side).
 * Generic source-of-truth for structured form PDFs — not vendor-specific.
 */
import "server-only";

import { installPdfJsNodePolyfills } from "./pdfjs-node-polyfills";

export type PdfFormFieldRow = {
  page: number;
  fieldName: string;
  fieldValue: string;
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 80;

function isNoiseValue(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (s === "Off") return true;
  if (s === "Yes" || s === "No") return false;
  if (/^\/(true|false)$/i.test(s)) return true;
  return false;
}

/**
 * Load PDF from HTTPS URL and return non-empty widget field values with page numbers.
 */
export async function extractPdfAcroFormFieldsFromUrl(fileUrl: string): Promise<PdfFormFieldRow[]> {
  await installPdfJsNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let doc: { destroy: () => Promise<void>; numPages: number } | null = null;
  try {
    const response = await fetch(fileUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`PDF fetch failed: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    doc = await task.promise;
    const numPages = Math.min(doc.numPages, MAX_PAGES);
    const out: PdfFormFieldRow[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const annotations =
        ((await page.getAnnotations({ intent: "display" })) as Array<Record<string, unknown>>) ?? [];
      for (const ann of annotations) {
        if (ann.subtype !== "Widget") continue;
        const fieldName = typeof ann.fieldName === "string" ? ann.fieldName.trim() : "";
        if (!fieldName) continue;
        const rawVal = ann.fieldValue;
        if (rawVal == null) continue;
        const strVal =
          typeof rawVal === "string"
            ? rawVal
            : Array.isArray(rawVal)
              ? rawVal.map(String).join("")
              : String(rawVal);
        if (isNoiseValue(strVal)) continue;
        // Skip pure radio/checkbox export tokens that are not human-readable values
        if (/^[a-z][a-z0-9]*$/i.test(strVal) && strVal.length < 4 && !/\d/.test(strVal)) {
          const looksLikeQuestionnaireKey =
            /questionnaire\.|communication\.|aml\.|\/(true|false)$/i.test(fieldName);
          if (looksLikeQuestionnaireKey) continue;
        }
        out.push({ page: i, fieldName, fieldValue: strVal.trim() });
      }
      page.cleanup();
    }

    await doc.destroy();
    doc = null;
    return out;
  } catch (e) {
    console.warn("[pdf-acroform-extract] failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  } finally {
    clearTimeout(tid);
    if (doc) {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
