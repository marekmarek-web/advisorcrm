import { NextResponse } from "next/server";
import { db, documents, activityLog } from "db";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { logAudit } from "@/lib/audit";

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

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Vyberte soubor." }, { status: 400 });
    }

    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Nepodporovaný typ souboru. Povolené jsou PDF a obrázky (JPG, PNG, WEBP, GIF, HEIC)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Soubor je příliš velký (max 20 MB)." }, { status: 400 });
    }

    const contactIdRaw = formData.get("contactId");
    const opportunityIdRaw = formData.get("opportunityId");
    const contractIdRaw = formData.get("contractId");
    const nameRaw = formData.get("name");
    const uploadSource = parseUploadSource(formData.get("uploadSource"));
    const visibleToClient = parseBoolean(formData.get("visibleToClient"));
    const tags = parseTags(formData.get("tags"));

    const contactId = typeof contactIdRaw === "string" && contactIdRaw.trim() ? contactIdRaw.trim() : null;
    const opportunityId = typeof opportunityIdRaw === "string" && opportunityIdRaw.trim() ? opportunityIdRaw.trim() : null;
    const contractId = typeof contractIdRaw === "string" && contractIdRaw.trim() ? contractIdRaw.trim() : null;
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : file.name;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathPrefix = contactId || opportunityId || "misc";
    const storagePath = `${membership.tenantId}/${pathPrefix}/${Date.now()}-${safeName}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, file, { upsert: false });
    if (uploadError) {
      const message =
        uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
          ? "Úložiště dokumentů není nastavené."
          : "Nahrání souboru selhalo.";
      return NextResponse.json({ error: message }, { status: 500 });
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
        mimeType: mimeType || null,
        sizeBytes: file.size,
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
      return NextResponse.json({ error: "Nepodařilo se uložit metadata dokumentu." }, { status: 500 });
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
      meta: {
        contactId: contactId ?? undefined,
        opportunityId: opportunityId ?? undefined,
        uploadSource,
        name,
      },
    }).catch(() => {});

    return NextResponse.json(inserted);
  } catch {
    return NextResponse.json({ error: "Nahrání dokumentu selhalo." }, { status: 500 });
  }
}
