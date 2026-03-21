import { NextResponse } from "next/server";
import { db, documents, activityLog } from "db";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { executeIdempotent } from "@/lib/security/idempotency";
import { detectMagicMimeTypeFromBytes, mimeMatchesAllowedSignature } from "@/lib/security/file-signature";
import { isUuid, sanitizeStorageSegment, toTrimmedString } from "@/lib/security/validation";

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

type UploadSource = "web" | "mobile_camera" | "mobile_gallery" | "mobile_file" | "mobile_share" | "mobile_scan";
type UploadResponseBody = { error: string } | { id: string; name: string; mimeType: string | null; sizeBytes: number | null };

function parseUploadSource(value: FormDataEntryValue | null): UploadSource {
  const raw = typeof value === "string" ? value : "";
  if (raw === "mobile_camera" || raw === "mobile_gallery" || raw === "mobile_file" || raw === "mobile_share" || raw === "mobile_scan") {
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
        })
        .returning({
          id: documents.id,
          name: documents.name,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
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

      return { status: 200, body: inserted };
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
