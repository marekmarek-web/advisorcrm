import { PDFDocument } from "pdf-lib";

/**
 * Build a single PDF from an array of image File objects.
 * Pages are embedded in order and scaled to fit a standard A4-ish page
 * while preserving aspect ratio.
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
  pdfDoc.setProducer("Aidvisor Scanner");
  pdfDoc.setCreationDate(new Date());

  for (const pageFile of pages) {
    const bytes = new Uint8Array(await pageFile.arrayBuffer());
    const mime = pageFile.type.toLowerCase();

    let image;
    if (mime === "image/png") {
      image = await pdfDoc.embedPng(bytes);
    } else {
      image = await pdfDoc.embedJpg(bytes);
    }

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

  // Copy into a fresh Uint8Array so TS accepts BlobPart (ArrayBuffer vs ArrayBufferLike).
  return new File([new Uint8Array(pdfBytes)], fileName, {
    type: "application/pdf",
    lastModified: timestamp,
  });
}
