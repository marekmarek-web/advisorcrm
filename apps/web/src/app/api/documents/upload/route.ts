import { NextResponse } from "next/server";
import { db, documents, activityLog, contacts, opportunities, contracts, eq, and } from "db";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { executeIdempotent } from "@/lib/security/idempotency";
import { detectMagicMimeTypeFromBytes, mimeMatchesAllowedSignature } from "@/lib/security/file-signature";
import { isUuid, sanitizeStorageSegment, toTrimmedString } from "@/lib/security/validation";
import { computeDocumentFingerprint } from "@/lib/documents/processing/fingerprint";
import type { DocumentSourceChannel } from "db";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const MAX_SIZE_BYTES = 20 * 1024 * 1024;

type UploadSource =
  | "web"
  | "mobile_camera"
  | "mobile_gallery"
  | "mobile_file"
  | "mobile_share"
  | "mobile_scan"
  | "web_scan"
  | "ai_drawer"
  | "backoffice_import";
type UploadResponseBody =
  | { error: string }
  | {
      id: string;
      name: string;
      mimeType: string | null;
      sizeBytes: number | null;
      ok: true;
      documentId: string;
      processingStatus: string | null;
    };

function parseUploadSource(value: FormDataEntryValue | null): UploadSource {
  const raw = typeof value === "string" ? value : "";
  if (
    raw === "mobile_camera" ||
    raw === "mobile_gallery" ||
    raw === "mobile_file" ||
    raw === "mobile_share" ||
    raw === "mobile_scan" ||
    raw === "web_scan" ||
    raw === "ai_drawer" ||
    raw === "backoffice_import"
  ) {
    return raw;
  }
  return "web";
}

function parseTags(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== "string") return null;
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length ? tags : null;
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return value === "true" || value === "1" || value === "on";
}

function parseCaptureMode(value: FormDataEntryValue | null): string | null {
  const s = toTrimmedString(value);
  return s || null;
}

function parseCaptureQualityWarnings(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out = parsed.filter((x): x is string => typeof x === "string");
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function parseOptionalBoolean(value: FormDataEntryValue | null): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return parseBoolean(value);
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
    const limiter = checkRateLimit(request, "documents-upload", `${membership.tenantId}:${user.id}`, {
      windowMs: 60_000,
      maxRequests: 20,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Too many upload attempts. Please retry later." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Vyberte soubor." }, { status: 400 });
    }

    const declaredMime = (file.type || "").toLowerCase().trim();

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Soubor je příliš velký (max 20 MB)." }, { status: 400 });
    }

    // Single read: avoid passing File to Storage after arrayBuffer() (breaks on Node/Undici for some clients).
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectMagicMimeTypeFromBytes(fileBytes.subarray(0, Math.min(64, fileBytes.byteLength)));
    let effectiveMime = declaredMime;
    if (!effectiveMime || effectiveMime === "application/octet-stream") {
      if (detectedMime && ALLOWED_MIME_TYPES.has(detectedMime)) {
        effectiveMime = detectedMime;
      }
    }
    if (!ALLOWED_MIME_TYPES.has(effectiveMime)) {
      return NextResponse.json(
        { error: "Nepodporovaný typ souboru. Povolené jsou PDF a obrázky (JPG, PNG, WEBP, GIF, HEIC)." },
        { status: 400 }
      );
    }
    if (!mimeMatchesAllowedSignature(effectiveMime, detectedMime)) {
      return NextResponse.json({ error: "Obsah souboru neodpovídá deklarovanému typu." }, { status: 400 });
    }

    const contactIdRaw = formData.get("contactId");
    const opportunityIdRaw = formData.get("opportunityId");
    const contractIdRaw = formData.get("contractId");
    const nameRaw = formData.get("name");
    const uploadSource = parseUploadSource(formData.get("uploadSource"));
    const visibleToClient = parseBoolean(formData.get("visibleToClient"));
    const tags = parseTags(formData.get("tags"));
    const pageCountRaw = formData.get("pageCount");
    const pageCount = pageCountRaw ? parseInt(String(pageCountRaw), 10) || null : null;
    const capturedPlatform = (formData.get("capturedPlatform") as "ios" | "android") || null;
    const isScanLike =
      uploadSource === "mobile_scan" || uploadSource === "web_scan" || uploadSource === "mobile_camera"
        ? true
        : null;
    const captureMode = parseCaptureMode(formData.get("captureMode"));
    const captureQualityWarnings = parseCaptureQualityWarnings(formData.get("captureQualityWarnings"));
    const manualCropApplied = parseOptionalBoolean(formData.get("manualCropApplied"));
    const rotationAdjusted = parseOptionalBoolean(formData.get("rotationAdjusted"));

    const sourceChannelMap: Record<string, DocumentSourceChannel> = {
      web: "web_upload",
      mobile_camera: "mobile_camera",
      mobile_gallery: "mobile_gallery",
      mobile_file: "mobile_file",
      mobile_share: "mobile_share",
      mobile_scan: "mobile_scan",
      web_scan: "web_scan",
    };
    const sourceChannel: DocumentSourceChannel = sourceChannelMap[uploadSource] ?? "web_upload";

    const contactIdValue = toTrimmedString(contactIdRaw);
    const opportunityIdValue = toTrimmedString(opportunityIdRaw);
    const contractIdValue = toTrimmedString(contractIdRaw);
    const contactId = contactIdValue ? contactIdValue : null;
    const opportunityId = opportunityIdValue ? opportunityIdValue : null;
    const contractId = contractIdValue ? contractIdValue : null;
    const name = toTrimmedString(nameRaw) || file.name;

    if ((contactId && !isUuid(contactId)) || (opportunityId && !isUuid(opportunityId)) || (contractId && !isUuid(contractId))) {
      return NextResponse.json({ error: "Invalid entity identifier." }, { status: 400 });
    }

    if (contactId) {
      const [row] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.tenantId, membership.tenantId))).limit(1);
      if (!row) return NextResponse.json({ error: "Contact not found." }, { status: 403 });
    }
    if (opportunityId) {
      const [row] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, membership.tenantId))).limit(1);
      if (!row) return NextResponse.json({ error: "Opportunity not found." }, { status: 403 });
    }
    if (contractId) {
      const [row] = await db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.tenantId, membership.tenantId))).limit(1);
      if (!row) return NextResponse.json({ error: "Contract not found." }, { status: 403 });
    }

    const idempotencyKeyHeader = request.headers.get("idempotency-key")?.trim() || "";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathPrefix = sanitizeStorageSegment(contactId || opportunityId, "misc");
    const storagePath = `${membership.tenantId}/${pathPrefix}/${Date.now()}-${safeName}`;

    const performUpload = async (): Promise<{ status: number; body: UploadResponseBody }> => {
      const admin = createAdminClient();
      const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, fileBytes, {
        contentType: effectiveMime,
        upsert: false,
      });
      if (uploadError) {
        const message =
          uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
            ? "Úložiště dokumentů není nastavené."
            : "Nahrání souboru selhalo.";
        return { status: 500, body: { error: message } };
      }

      const fingerprint = await computeDocumentFingerprint(fileBytes).catch(() => null);

      const [inserted] = await db
        .insert(documents)
        .values({
          tenantId: membership.tenantId,
          contactId,
          opportunityId,
          contractId,
          name,
          storagePath,
          mimeType: effectiveMime || null,
          sizeBytes: fileBytes.byteLength,
          tags,
          visibleToClient,
          uploadSource,
          uploadedBy: user.id,
          pageCount,
          capturedPlatform,
          isScanLike,
          sourceChannel,
          documentFingerprint: fingerprint,
          captureMode,
          captureQualityWarnings,
          manualCropApplied,
          rotationAdjusted,
        })
        .returning({
          id: documents.id,
          name: documents.name,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
          processingStatus: documents.processingStatus,
        });

      if (!inserted?.id) {
        return { status: 500, body: { error: "Nepodařilo se uložit metadata dokumentu." } };
      }

      await db
        .insert(activityLog)
        .values({
          tenantId: membership.tenantId,
          userId: user.id,
          entityType: "document",
          entityId: inserted.id,
          action: "upload",
          meta: {
            contactId: contactId ?? undefined,
            opportunityId: opportunityId ?? undefined,
            uploadSource,
            name,
          },
        })
        .catch(() => {});

      await logAudit({
        tenantId: membership.tenantId,
        userId: user.id,
        action: "upload",
        entityType: "document",
        entityId: inserted.id,
        request,
        meta: {
          contactId: contactId ?? undefined,
          opportunityId: opportunityId ?? undefined,
          uploadSource,
          name,
        },
      }).catch(() => {});

      return {
        status: 200,
        body: {
          ...inserted,
          ok: true as const,
          documentId: inserted.id,
          processingStatus: inserted.processingStatus ?? "none",
        },
      };
    };

    if (idempotencyKeyHeader) {
      const scopedKey = `documents:${membership.tenantId}:${user.id}:${idempotencyKeyHeader}`;
      const replay = await executeIdempotent<UploadResponseBody>(scopedKey, 5 * 60_000, performUpload);
      return NextResponse.json(replay.result.body, {
        status: replay.result.status,
        headers: replay.replayed ? { "x-idempotent-replay": "1" } : undefined,
      });
    }

    const result = await performUpload();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "Nahrání dokumentu selhalo." }, { status: 500 });
  }
}
