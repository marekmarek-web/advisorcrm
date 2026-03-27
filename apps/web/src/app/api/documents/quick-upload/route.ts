import { NextResponse, after } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { db, documents, activityLog, contacts, eq, and } from "db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { detectMagicMimeTypeFromBytes, mimeMatchesAllowedSignature } from "@/lib/security/file-signature";
import { isUuid, sanitizeStorageSegment, toTrimmedString } from "@/lib/security/validation";
import { computeDocumentFingerprint } from "@/lib/documents/processing/fingerprint";
import { processDocument } from "@/lib/documents/processing/orchestrator";
import { buildPdfFromImageBuffers } from "@/lib/scan/build-pdf-from-images-server";
import { logAudit } from "@/lib/audit";
import type { DocumentSourceChannel } from "db";

export const dynamic = "force-dynamic";
/** Adobe OCR + markdown může trvat; práce běží v `after()`. */
export const maxDuration = 300;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const MAX_FILES = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

type QuickUploadSource = "web_quick" | "mobile_quick";

function parseQuickSource(value: FormDataEntryValue | null): QuickUploadSource {
  return typeof value === "string" && value.trim() === "mobile_quick" ? "mobile_quick" : "web_quick";
}

function parseTags(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== "string") return null;
  const tags = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const membership = await getMembership(user.id);
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "documents-quick-upload", `${membership.tenantId}:${user.id}`, {
      windowMs: 60_000,
      maxRequests: 15,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho nahrání. Zkuste to za chvíli." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const formData = await request.formData();
    const rawFiles = formData.getAll("files").filter((e): e is File => e instanceof File && e.size > 0);

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: "Vyberte alespoň jeden soubor (PDF nebo obrázky)." }, { status: 400 });
    }
    if (rawFiles.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximálně ${MAX_FILES} souborů.` }, { status: 400 });
    }

    let totalSize = 0;
    for (const f of rawFiles) {
      totalSize += f.size;
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "Jeden ze souborů přesahuje 20 MB." }, { status: 400 });
      }
    }
    if (totalSize > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "Soubory dohromady přesahují 20 MB." }, { status: 400 });
    }

    const contactIdRaw = formData.get("contactId");
    const nameRaw = formData.get("name");
    const tags = parseTags(formData.get("tags"));
    const visibleToClient = formData.get("visibleToClient") === "true" || formData.get("visibleToClient") === "1";
    const uploadSource = parseQuickSource(formData.get("uploadSource"));

    const contactIdValue = toTrimmedString(contactIdRaw);
    const contactId = contactIdValue ? contactIdValue : null;
    if (contactId && !isUuid(contactId)) {
      return NextResponse.json({ error: "Neplatný klient." }, { status: 400 });
    }
    if (contactId) {
      const [row] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, membership.tenantId)))
        .limit(1);
      if (!row) return NextResponse.json({ error: "Klient nenalezen." }, { status: 403 });
    }

    const prepared: { bytes: Uint8Array; pageCount: number; displayName: string } = await (async () => {
      const declaredTypes = rawFiles.map((f) => (f.type || "").toLowerCase().trim());
      const allPdf =
        rawFiles.length >= 1 &&
        rawFiles.every((f, i) => {
          const d = declaredTypes[i];
          const namePdf = f.name.toLowerCase().trim().endsWith(".pdf");
          return d === "application/pdf" || ((d === "" || d === "application/octet-stream") && namePdf);
        });

      if (allPdf && rawFiles.length > 1) {
        throw new Error("Více PDF najednou nepodporujeme. Nahrajte jedno PDF, nebo více obrázků.");
      }

      if (allPdf && rawFiles.length === 1) {
        const f = rawFiles[0]!;
        const bytes = new Uint8Array(await f.arrayBuffer());
        const detected = detectMagicMimeTypeFromBytes(bytes.subarray(0, Math.min(64, bytes.byteLength)));
        if (detected !== "application/pdf") {
          throw new Error("Soubor není platné PDF.");
        }
        const rawStem = toTrimmedString(nameRaw) || f.name.replace(/\.pdf$/i, "") || "Dokument";
        const stem = rawStem.replace(/\.pdf$/i, "").trim() || "Dokument";
        return { bytes, pageCount: await countPdfPages(bytes), displayName: `${stem}.pdf` };
      }

      const imagePages: { bytes: Uint8Array; mime: string }[] = [];
      for (let i = 0; i < rawFiles.length; i++) {
        const f = rawFiles[i]!;
        const fileBytes = new Uint8Array(await f.arrayBuffer());
        const detectedMime = detectMagicMimeTypeFromBytes(fileBytes.subarray(0, Math.min(64, fileBytes.byteLength)));
        let effectiveMime = declaredTypes[i] || "";
        if (!effectiveMime || effectiveMime === "application/octet-stream") {
          if (detectedMime && ALLOWED_IMAGE_TYPES.has(detectedMime)) {
            effectiveMime = detectedMime;
          }
        }
        if (!ALLOWED_IMAGE_TYPES.has(effectiveMime)) {
          throw new Error(`Nepodporovaný typ souboru. Použijte obrázky (JPG, PNG, …) nebo jedno PDF.`);
        }
        if (!mimeMatchesAllowedSignature(effectiveMime, detectedMime)) {
          throw new Error("Obsah souboru neodpovídá typu.");
        }
        imagePages.push({ bytes: fileBytes, mime: effectiveMime });
      }

      const pdfBytes = await buildPdfFromImageBuffers(imagePages);
      const baseName = toTrimmedString(nameRaw) || "Rychlé nahrání";
      return {
        bytes: pdfBytes,
        pageCount: imagePages.length,
        displayName: `${baseName.replace(/\.pdf$/i, "")}.pdf`,
      };
    })();

    const pathPrefix = sanitizeStorageSegment(contactId || "misc", "misc");
    const safeStem = prepared.displayName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${membership.tenantId}/${pathPrefix}/${Date.now()}-${safeStem}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, prepared.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      const message =
        uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
          ? "Úložiště dokumentů není nastavené."
          : "Nahrání souboru selhalo.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const fingerprint = await computeDocumentFingerprint(prepared.bytes).catch(() => null);
    const docName = toTrimmedString(nameRaw) || prepared.displayName.replace(/\.pdf$/i, "") || "Dokument";

    const sourceChannel: DocumentSourceChannel = "portal_quick_upload";

    const [inserted] = await db
      .insert(documents)
      .values({
        tenantId: membership.tenantId,
        contactId,
        name: docName,
        storagePath,
        mimeType: "application/pdf",
        sizeBytes: prepared.bytes.byteLength,
        tags,
        visibleToClient,
        uploadSource,
        uploadedBy: user.id,
        pageCount: prepared.pageCount,
        isScanLike: false,
        sourceChannel,
        documentFingerprint: fingerprint,
        captureMode: "quick_upload",
        processingStatus: "queued",
      })
      .returning({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        processingStatus: documents.processingStatus,
      });

    if (!inserted?.id) {
      return NextResponse.json({ error: "Nepodařilo se uložit dokument." }, { status: 500 });
    }

    await db
      .insert(activityLog)
      .values({
        tenantId: membership.tenantId,
        userId: user.id,
        entityType: "document",
        entityId: inserted.id,
        action: "upload",
        meta: { contactId: contactId ?? undefined, uploadSource, name: docName, quickUpload: true },
      })
      .catch(() => {});

    await logAudit({
      tenantId: membership.tenantId,
      userId: user.id,
      action: "upload",
      entityType: "document",
      entityId: inserted.id,
      request,
      meta: { contactId: contactId ?? undefined, uploadSource, name: docName, quickUpload: true },
    }).catch(() => {});

    const docRow = {
      id: inserted.id,
      tenantId: membership.tenantId,
      storagePath,
      mimeType: "application/pdf" as string | null,
      sizeBytes: prepared.bytes.byteLength,
      uploadSource,
      pageCount: prepared.pageCount,
      hasTextLayer: null as boolean | null,
      isScanLike: false as boolean | null,
    };

    after(async () => {
      try {
        await processDocument(docRow, user.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[documents/quick-upload] after() processDocument failed", message);
      }
    });

    return NextResponse.json({
      ok: true as const,
      documentId: inserted.id,
      id: inserted.id,
      name: inserted.name,
      mimeType: inserted.mimeType,
      sizeBytes: inserted.sizeBytes,
      processingStatus: inserted.processingStatus,
      backgroundProcessingStarted: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nahrání selhalo.";
    if (
      message.includes("Nepodporovaný") ||
      message.includes("neplatné") ||
      message.includes("platné PDF") ||
      message.includes("Více PDF") ||
      message.includes("neodpovídá") ||
      message.includes("Vložení stránky") ||
      message.includes("Žádné stránky")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 1;
  }
}
