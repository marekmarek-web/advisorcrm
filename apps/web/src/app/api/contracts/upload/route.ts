import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { assertQuotaAvailable } from "@/lib/billing/subscription-usage";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { createAdminClient } from "@/lib/supabase/server";
import { createContractReview } from "@/lib/ai/review-queue-repository";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { detectMagicMimeTypeFromBytes, mimeMatchesAllowedSignature } from "@/lib/security/file-signature";
import { tryBeginIdempotencyWindow } from "@/lib/security/idempotency";

export const dynamic = "force-dynamic";

// PDF is the primary format. Common image types are accepted too — scan gate handles text-less scans.
// DOC/DOCX are NOT accepted: no server-side conversion pipeline is available.
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Set by middleware; /api/contracts/* autorizujeme jen přes hlavičku (bez Supabase v route). */
const USER_ID_HEADER = "x-user-id";

export async function POST(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.id === userId ? user.email ?? null : null;
    try {
      await assertCapability({
        tenantId: membership.tenantId,
        userId,
        email,
        capability: "ai_review",
      });
      await assertQuotaAvailable({
        tenantId: membership.tenantId,
        userId,
        email,
        dimension: "ai_review_pages",
        amount: 1,
      });
    } catch (e) {
      const r = nextResponseFromPlanOrQuotaError(e);
      if (r) return r;
      throw e;
    }

    const limiter = checkRateLimit(request, "contracts-upload", `${membership.tenantId}:${userId}`, {
      windowMs: 60_000,
      maxRequests: 10,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho nahrání. Zkuste to za chvíli." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json(
        { error: "Vyberte soubor (PDF nebo obrázek)." },
        { status: 400 }
      );
    }

    // Single read: Node/Undici File can fail on Supabase upload after arrayBuffer() was consumed.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (fileBytes.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Soubor je příliš velký (max 20 MB)." },
        { status: 400 }
      );
    }

    const detectedMime = detectMagicMimeTypeFromBytes(fileBytes.subarray(0, Math.min(64, fileBytes.byteLength)));
    let mimeType = (file.type?.toLowerCase() || "").trim();
    // iOS/Safari often sends empty type or application/octet-stream for real PDFs.
    if (!mimeType || mimeType === "application/octet-stream") {
      if (detectedMime && ALLOWED_MIME.includes(detectedMime)) {
        mimeType = detectedMime;
      }
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        {
          error:
            "Nepodporovaný formát. Povolené jsou PDF a obrázky (JPG, PNG, WEBP, HEIC). Soubory Word/Excel nejsou podporovány — převeďte je do PDF.",
        },
        { status: 400 }
      );
    }
    if (!mimeMatchesAllowedSignature(mimeType, detectedMime)) {
      return NextResponse.json({ error: "Obsah souboru neodpovídá deklarovanému typu." }, { status: 400 });
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (idempotencyKey) {
      const scopedKey = `contracts:${membership.tenantId}:${userId}:${idempotencyKey}`;
      const accepted = tryBeginIdempotencyWindow(scopedKey, 5 * 60_000);
      if (!accepted) {
        return NextResponse.json({ error: "Duplicitní požadavek na nahrání." }, { status: 409 });
      }
    }

    const tenantId = membership.tenantId;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = crypto.randomUUID();
    const storagePath = `contracts/${tenantId}/${id}/${Date.now()}-${safeName}`;

    const admin = createAdminClient();
    // Supabase JS na Node/Vercel spolehlivěji přijímá Buffer než čistý Uint8Array.
    const uploadBuffer = Buffer.from(fileBytes);

    let uploadError: { message?: string } | null = null;
    try {
      const up = await admin.storage.from("documents").upload(storagePath, uploadBuffer, {
        contentType: mimeType,
        upsert: false,
      });
      uploadError = up.error;
    } catch (storageErr) {
      console.error("[contracts/upload] storage.upload threw", storageErr);
      return NextResponse.json(
        { error: "Nahrání souboru selhalo.", code: "STORAGE_EXCEPTION" },
        { status: 500 }
      );
    }

    if (uploadError) {
      console.error("[contracts/upload] storage error", uploadError.message ?? uploadError);
      const safeMsg =
        uploadError.message?.toLowerCase().includes("bucket") ||
        uploadError.message?.toLowerCase().includes("not found")
          ? "Úložiště není dostupné."
          : "Nahrání souboru selhalo.";
      return NextResponse.json({ error: safeMsg, code: "STORAGE_REJECTED" }, { status: 500 });
    }

    let reviewId: string;
    try {
      reviewId = await createContractReview({
        tenantId,
        fileName: file.name,
        storagePath,
        mimeType,
        sizeBytes: fileBytes.byteLength,
        processingStatus: "uploaded",
        uploadedBy: userId,
      });
    } catch (dbErr) {
      const pgMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const pgCode = (dbErr as { code?: string })?.code;
      console.error("[contracts/upload] createContractReview failed", { message: pgMsg, code: pgCode });
      await admin.storage.from("documents").remove([storagePath]).catch(() => {});
      return NextResponse.json(
        {
          error:
            "Nepodařilo se uložit smlouvu do databáze. Zkontroluj migrace (tabulka contract_upload_reviews) a DATABASE_URL.",
          code: "DB_INSERT_REVIEW",
        },
        { status: 500 }
      );
    }

    await logAudit({
      tenantId,
      userId,
      action: "contract_uploaded",
      entityType: "contract_review",
      entityId: reviewId,
      request,
    }).catch(() => {});

    // Return immediately — frontend will call POST /api/contracts/review/[id]/process to start pipeline.
    return NextResponse.json({ id: reviewId, status: "uploaded" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : typeof err;
    console.error(
      "[route POST /api/contracts/upload] 500",
      errName,
      message,
      err instanceof Error ? err.stack : ""
    );
    return NextResponse.json(
      { error: "Nahrání smlouvy selhalo.", code: "CONTRACT_UPLOAD_UNHANDLED" },
      { status: 500 }
    );
  }
}
