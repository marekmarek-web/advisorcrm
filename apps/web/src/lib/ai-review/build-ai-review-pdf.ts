import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import type { ExtractionDocument, AIRecommendation, DraftAction } from "./types";
import { formatAiClassifierForAdvisor, humanizeReviewReasonLine } from "./czech-labels";
import { getDocumentTypeLabel } from "../ai/document-messages";
import type { PrimaryDocumentType } from "../ai/document-review-types";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const LINE_GAP = 4;
const SECTION_GAP = 10;
const INDIGO = { r: 0.31, g: 0.27, b: 0.9 };
const TEXT = { r: 0.12, g: 0.11, b: 0.18 };
const MUTED = { r: 0.35, g: 0.39, b: 0.47 };

const REVIEW_STATUS_CS: Record<string, string> = {
  pending: "Čeká na kontrolu",
  in_review: "V kontrole",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  applied: "Propsáno do Aidvisory",
};

/** Ubuntu supports češtinu; standardní PDF fonty (Helvetica) ne. */
const PDF_FONT_REGULAR_URL = "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf";
const PDF_FONT_BOLD_URL = "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-B.ttf";

let cachedPdfFonts: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadPdfUnicodeFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (cachedPdfFonts) return cachedPdfFonts;
  const [regular, bold] = await Promise.all([
    fetch(PDF_FONT_REGULAR_URL).then((r) => {
      if (!r.ok) throw new Error(`PDF font load failed: ${PDF_FONT_REGULAR_URL}`);
      return r.arrayBuffer();
    }),
    fetch(PDF_FONT_BOLD_URL).then((r) => {
      if (!r.ok) throw new Error(`PDF font load failed: ${PDF_FONT_BOLD_URL}`);
      return r.arrayBuffer();
    }),
  ]);
  cachedPdfFonts = { regular, bold };
  return cachedPdfFonts;
}

const PROCESSING_STATUS_CS: Record<string, string> = {
  uploaded: "Nahráno",
  processing: "Zpracovává se",
  extracted: "Extrahováno",
  review_required: "Vyžaduje kontrolu",
  blocked: "Blokováno (kontrola)",
  failed: "Selhalo",
  scan_pending_ocr: "Čeká na OCR",
};

function documentTypeDisplayLine(doc: ExtractionDocument): string {
  const aiRaw = doc.extractionTrace?.aiClassifierJson as Record<string, string> | undefined;
  if (aiRaw && (aiRaw.documentType || aiRaw.productFamily)) {
    return formatAiClassifierForAdvisor(aiRaw);
  }
  const label = doc.documentType?.trim() ?? "";
  if (!label) return "Neurčeno";
  if (/[·•]/.test(label) || /[áčďéěíňóřšťúůýž]/i.test(label)) {
    return label;
  }
  const phrase = getDocumentTypeLabel(label as PrimaryDocumentType);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function wrapLineToWidth(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxW: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split("\n");
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= maxW) {
        line = trial;
      } else {
        if (line) out.push(line);
        if (font.widthOfTextAtSize(w, size) <= maxW) {
          line = w;
        } else {
          let chunk = "";
          for (const ch of w) {
            const t2 = chunk + ch;
            if (font.widthOfTextAtSize(t2, size) <= maxW) chunk = t2;
            else {
              if (chunk) out.push(chunk);
              chunk = ch;
            }
          }
          line = chunk;
        }
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

type DrawState = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
  margin: number;
  contentWidth: number;
};

function ensureSpace(state: DrawState, need: number): DrawState {
  const bottom = state.margin + need;
  if (state.y >= bottom) return state;
  const page = state.pdfDoc.addPage([PAGE_W, PAGE_H]);
  return { ...state, page, y: PAGE_H - state.margin };
}

function drawLines(
  state: DrawState,
  lines: string[],
  size: number,
  color: { r: number; g: number; b: number },
  rgbFn: typeof import("pdf-lib").rgb,
  useBold = false
): DrawState {
  const lineH = size + LINE_GAP;
  const f = useBold ? state.fontBold : state.font;
  let s = state;
  for (const line of lines) {
    s = ensureSpace(s, lineH + 8);
    s.page.drawText(line, {
      x: s.margin,
      y: s.y,
      size,
      font: f,
      color: rgbFn(color.r, color.g, color.b),
    });
    s = { ...s, y: s.y - lineH };
  }
  return s;
}

function drawBoldTitle(state: DrawState, title: string, size: number, rgbFn: typeof import("pdf-lib").rgb): DrawState {
  const lines = wrapLineToWidth(title, state.fontBold, size, state.contentWidth);
  let s = state;
  const lineH = size + LINE_GAP;
  for (const line of lines) {
    s = ensureSpace(s, lineH + 8);
    s.page.drawText(line, {
      x: s.margin,
      y: s.y,
      size,
      font: state.fontBold,
      color: rgbFn(INDIGO.r, INDIGO.g, INDIGO.b),
    });
    s = { ...s, y: s.y - lineH };
  }
  return { ...s, y: s.y - SECTION_GAP };
}

/** Vygeneruje PDF souhrn AI kontroly (stejná data jako v UI včetně úprav polí). */
export async function buildAiReviewPdfBlob(
  doc: ExtractionDocument,
  editedFields: Record<string, string>,
  options?: { dismissedRecommendationIds?: Record<string, boolean> }
): Promise<Blob> {
  const [{ PDFDocument, rgb }, fontkitMod] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkitMod.default);
  const { regular: regularBytes, bold: boldBytes } = await loadPdfUnicodeFonts();
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const margin = MARGIN;
  const contentWidth = PAGE_W - 2 * margin;

  let state: DrawState = {
    pdfDoc,
    page,
    font,
    fontBold,
    y: PAGE_H - margin,
    margin,
    contentWidth,
  };

  state = drawBoldTitle(state, "Aidvisora — AI Review smluv", 16, rgb);
  state = drawLines(
    state,
    wrapLineToWidth(`Soubor: ${doc.fileName || "—"}`, font, 10, contentWidth),
    10,
    TEXT,
    rgb
  );
  state = drawLines(
    state,
    wrapLineToWidth(`Typ dokumentu: ${documentTypeDisplayLine(doc)}`, font, 10, contentWidth),
    10,
    MUTED,
    rgb
  );
  const procLabel = PROCESSING_STATUS_CS[doc.processingStatus] ?? doc.processingStatus;
  const revLabel = REVIEW_STATUS_CS[doc.reviewStatus] ?? doc.reviewStatus ?? "—";
  state = drawLines(
    state,
    wrapLineToWidth(`Stav zpracování: ${procLabel}`, font, 10, contentWidth),
    10,
    MUTED,
    rgb
  );
  state = drawLines(
    state,
    wrapLineToWidth(`Stav kontroly: ${revLabel}`, font, 10, contentWidth),
    10,
    MUTED,
    rgb
  );
  if (doc.globalConfidence > 0) {
    // globalConfidence is already 0-100 (percent) from mapApiToExtractionDocument — do NOT multiply by 100 again
    const confDisplayPct = doc.globalConfidence > 1 ? Math.round(doc.globalConfidence) : Math.round(doc.globalConfidence * 100);
    state = drawLines(
      state,
      wrapLineToWidth(`Celková jistota modelu: ${confDisplayPct} %`, font, 10, contentWidth),
      10,
      MUTED,
      rgb
    );
  }
  const exportedAt = new Date().toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });
  state = drawLines(state, wrapLineToWidth(`Exportováno: ${exportedAt}`, font, 9, contentWidth), 9, MUTED, rgb);
  state = { ...state, y: state.y - SECTION_GAP };

  if (doc.executiveSummary?.trim()) {
    state = drawBoldTitle(state, "Shrnutí", 11, rgb);
    state = drawLines(state, wrapLineToWidth(doc.executiveSummary.trim(), font, 10, contentWidth), 10, TEXT, rgb);
    state = { ...state, y: state.y - SECTION_GAP };
  }

  if (doc.advisorReview) {
    const ar = doc.advisorReview;
    state = drawBoldTitle(state, "Strukturovaný přehled", 12, rgb);
    const lines: Array<{ label: string; body: string }> = [
      { label: "Rozpoznání dokumentu", body: ar.recognition },
      { label: "Klient", body: ar.client },
      { label: "Produkt", body: ar.product },
      { label: "Platby", body: ar.payments },
      { label: "Citlivé údaje", body: ar.healthSensitive },
    ];
    for (const row of lines) {
      if (!row.body?.trim()) continue;
      state = drawLines(state, wrapLineToWidth(`${row.label}:`, fontBold, 9, contentWidth), 9, MUTED, rgb, true);
      state = drawLines(state, wrapLineToWidth(row.body.trim(), font, 10, contentWidth), 10, TEXT, rgb);
    }
    if (ar.llmExecutiveBrief?.trim()) {
      state = drawLines(state, wrapLineToWidth("Shrnutí (AI):", fontBold, 9, contentWidth), 9, MUTED, rgb, true);
      state = drawLines(state, wrapLineToWidth(ar.llmExecutiveBrief.trim(), font, 10, contentWidth), 10, TEXT, rgb);
    }
    if (ar.manualChecklist?.length) {
      state = drawLines(state, wrapLineToWidth("Ruční kontrola:", fontBold, 9, contentWidth), 9, MUTED, rgb, true);
      for (const item of ar.manualChecklist) {
        if (item?.trim()) {
          const line = humanizeReviewReasonLine(item.trim());
          state = drawLines(state, wrapLineToWidth(`• ${line}`, font, 10, contentWidth), 10, TEXT, rgb);
        }
      }
    }
    state = { ...state, y: state.y - SECTION_GAP };
  }

  const rawReasons = doc.reasonsForReview?.filter((r) => r?.trim()) ?? [];
  if (rawReasons.length > 0) {
    state = drawBoldTitle(state, "Důvody kontroly (pipeline)", 11, rgb);
    for (const r of rawReasons) {
      state = drawLines(
        state,
        wrapLineToWidth(`• ${humanizeReviewReasonLine(r.trim())}`, font, 10, contentWidth),
        10,
        TEXT,
        rgb
      );
    }
    state = { ...state, y: state.y - SECTION_GAP };
  }

  for (const group of doc.groups) {
    state = drawBoldTitle(state, group.name, 12, rgb);
    for (const field of group.fields) {
      const raw = editedFields[field.id] ?? field.value;
      const value = raw?.trim() ? raw : "—";
      const edited = editedFields[field.id] !== undefined && editedFields[field.id] !== field.value;
      const suffix = edited ? " (upraveno v kontrole)" : "";
      const labelLines = wrapLineToWidth(`${field.label}:${suffix}`, fontBold, 9, contentWidth);
      let s = state;
      for (const ll of labelLines) {
        s = ensureSpace(s, 20);
        s.page.drawText(ll, {
          x: margin,
          y: s.y,
          size: 9,
          font: fontBold,
          color: rgb(MUTED.r, MUTED.g, MUTED.b),
        });
        s = { ...s, y: s.y - 11 };
      }
      const valueLines = wrapLineToWidth(value, font, 10, contentWidth);
      s = drawLines(s, valueLines, 10, TEXT, rgb);
      state = { ...s, y: s.y - 4 };
    }
    state = { ...state, y: state.y - SECTION_GAP };
  }

  const dismissed = options?.dismissedRecommendationIds ?? {};
  const activeRecs: AIRecommendation[] = [
    ...doc.recommendations,
    ...doc.extraRecommendations,
  ].filter((r) => !r.dismissed && !dismissed[r.id]);

  if (activeRecs.length > 0) {
    state = drawBoldTitle(state, "Interní upozornění a oblasti k ověření", 12, rgb);
    for (const r of activeRecs) {
      const head = `[${r.severity}] ${r.title}`;
      state = drawLines(state, wrapLineToWidth(head, fontBold, 10, contentWidth), 10, TEXT, rgb);
      if (r.description?.trim()) {
        state = drawLines(state, wrapLineToWidth(r.description.trim(), font, 9, contentWidth), 9, MUTED, rgb);
      }
      state = { ...state, y: state.y - 6 };
    }
    state = { ...state, y: state.y - SECTION_GAP };
  }

  if (doc.draftActions?.length) {
    state = drawBoldTitle(state, "Navrhované akce", 12, rgb);
    doc.draftActions.forEach((a: DraftAction, i: number) => {
      const line = `${i + 1}. ${a.label?.trim() || "Akce"}`;
      state = drawLines(state, wrapLineToWidth(line, font, 10, contentWidth), 10, TEXT, rgb);
    });
    state = { ...state, y: state.y - SECTION_GAP };
  }

  if (doc.clientMatchCandidates?.length) {
    state = drawBoldTitle(state, "Kandidáti klientů (CRM)", 12, rgb);
    for (const c of doc.clientMatchCandidates.slice(0, 12)) {
      const name = c.displayName ?? c.clientId;
      const line = `${name} — ${Math.round(c.score * 100)} %`;
      state = drawLines(state, wrapLineToWidth(line, font, 10, contentWidth), 10, MUTED, rgb);
    }
    state = { ...state, y: state.y - SECTION_GAP };
  }

  state = drawLines(
    state,
    wrapLineToWidth(
      "Export z Aidvisora — AI Review smluv. Jedná se o informativní souhrn; pro právní účely používejte originální dokument.",
      font,
      8,
      contentWidth
    ),
    8,
    MUTED,
    rgb
  );

  const bytes = await pdfDoc.save();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}

export function aiReviewPdfFileName(doc: ExtractionDocument): string {
  const base = (doc.fileName || "ai-review").replace(/\.[^/.]+$/, "");
  const safe = base.replace(/[^\w\u00C0-\u024F.-]+/g, "_").slice(0, 80);
  const d = new Date().toISOString().slice(0, 10);
  return `ai-review-${safe || "dokument"}-${d}.pdf`;
}
