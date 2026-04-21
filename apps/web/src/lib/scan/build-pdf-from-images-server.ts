import { PDFDocument } from "pdf-lib";

const MARGIN_PT = 4.5;

async function toJpegBytes(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (m === "image/jpeg" || m === "image/jpg") return bytes;
  const sharp = (await import("sharp")).default;
  return new Uint8Array(await sharp(Buffer.from(bytes)).jpeg({ quality: 90 }).toBuffer());
}

/**
 * Build a multipage PDF from image buffers (Node / server).
 * PNG is embedded natively; ostatní typy přes JPEG (včetně HEIC/WebP/GIF přes sharp).
 */
export async function buildPdfFromImageBuffers(
  pages: { bytes: Uint8Array; mime: string }[]
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("Žádné stránky k uložení.");
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer("Aidvisora Quick Upload");
  // Deterministic metadata — enables SHA-256 dedup on the output PDF across
  // repeated uploads of the same images.
  const FIXED_DATE = new Date(0);
  pdfDoc.setCreationDate(FIXED_DATE);
  pdfDoc.setModificationDate(FIXED_DATE);

  for (const page of pages) {
    const mime = page.mime.toLowerCase().split(";")[0]!.trim();
    const bytes = page.bytes;

    if (!mime.startsWith("image/")) {
      throw new Error(`Očekáván obrázek, dostáno: ${mime}`);
    }

    try {
      let image: Awaited<ReturnType<PDFDocument["embedJpg"]>>;
      if (mime === "image/png") {
        image = await pdfDoc.embedPng(bytes);
      } else {
        const jpegBytes = await toJpegBytes(bytes, mime);
        image = await pdfDoc.embedJpg(jpegBytes);
      }
      const { width: imgW, height: imgH } = image.scale(1);
      const pageW = imgW + 2 * MARGIN_PT;
      const pageH = imgH + 2 * MARGIN_PT;
      const pdfPage = pdfDoc.addPage([pageW, pageH]);
      pdfPage.drawImage(image, { x: MARGIN_PT, y: MARGIN_PT, width: imgW, height: imgH });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Vložení stránky do PDF selhalo: ${msg}`);
    }
  }

  return await pdfDoc.save();
}
