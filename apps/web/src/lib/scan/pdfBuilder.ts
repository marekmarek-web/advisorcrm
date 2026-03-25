import { PDFDocument } from "pdf-lib";

async function embedRasterPage(
  pdfDoc: PDFDocument,
  pageFile: File
): Promise<Awaited<ReturnType<PDFDocument["embedPng"]>>> {
  const bytes = new Uint8Array(await pageFile.arrayBuffer());
  const mime = (pageFile.type || "").toLowerCase();

  if (mime === "image/png") {
    return pdfDoc.embedPng(bytes);
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return pdfDoc.embedJpg(bytes);
  }

  if (typeof createImageBitmap === "undefined") {
    throw new Error(
      "Tento typ obrázku nelze v prohlížeči vložit do PDF. Uložte prosím jako JPG nebo PNG, nebo použijte mobilní aplikaci."
    );
  }

  const bitmap = await createImageBitmap(pageFile);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas není k dispozici.");
    }
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    if (!blob) {
      throw new Error("Konverze obrázku do PDF selhala.");
    }
    const jpegBytes = new Uint8Array(await blob.arrayBuffer());
    return pdfDoc.embedJpg(jpegBytes);
  } finally {
    bitmap.close();
  }
}

/**
 * Build a single PDF from an array of image File objects.
 * Pages are embedded in order and scaled to fit a standard A4-ish page
 * while preserving aspect ratio.
 * Non-JPEG/PNG images are rasterized via canvas in the browser (HEIC/WebP/GIF…).
 */
export async function buildPdfFromImages(
  pages: File[],
  options?: { documentName?: string }
): Promise<File> {
  if (pages.length === 0) {
    throw new Error("No pages to build PDF from.");
  }

  const pdfDoc = await PDFDocument.create();

  if (options?.documentName) {
    pdfDoc.setTitle(options.documentName);
  }
  pdfDoc.setProducer("Aidvisora Scanner");
  pdfDoc.setCreationDate(new Date());

  for (const pageFile of pages) {
    const image = await embedRasterPage(pdfDoc, pageFile);
    const { width: imgW, height: imgH } = image.scale(1);

    const PAGE_W = 595.28; // A4 width in points
    const PAGE_H = 841.89; // A4 height in points
    const MARGIN = 0;

    const availW = PAGE_W - 2 * MARGIN;
    const availH = PAGE_H - 2 * MARGIN;
    const scale = Math.min(availW / imgW, availH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;

    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawImage(image, {
      x: (PAGE_W - drawW) / 2,
      y: (PAGE_H - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const timestamp = Date.now();
  const safeName = (options?.documentName ?? "scan").replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${safeName}-${timestamp}.pdf`;

  return new File([new Uint8Array(pdfBytes)], fileName, {
    type: "application/pdf",
    lastModified: timestamp,
  });
}
