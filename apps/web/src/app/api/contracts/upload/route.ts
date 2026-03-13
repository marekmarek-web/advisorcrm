import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { createAdminClient } from "@/lib/supabase/server";
import { createContractReview, updateContractReview } from "@/lib/ai/review-queue-repository";
import { extractContractFromFile } from "@/lib/ai/contract-extraction";
import { findClientCandidates, buildAllDraftActions } from "@/lib/ai/draft-actions";
import { isMatchingAmbiguous } from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = ["application/pdf"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

function maskForLog(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  if (s.length <= 4) return "***";
  return s.slice(0, 2) + "***" + s.slice(-2);
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(user.id);
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json(
        { error: "Vyberte soubor (PDF)." },
        { status: 400 }
      );
    }

    const mimeType = file.type?.toLowerCase() || "";
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: "Povolený formát je pouze PDF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Soubor je příliš velký (max 20 MB)." },
        { status: 400 }
      );
    }

    const tenantId = membership.tenantId;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = crypto.randomUUID();
    const storagePath = `contracts/${tenantId}/${id}/${Date.now()}-${safeName}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      const safeMsg =
        uploadError.message?.toLowerCase().includes("bucket") ||
        uploadError.message?.toLowerCase().includes("not found")
          ? "Úložiště není dostupné."
          : "Nahrání souboru selhalo.";
      return NextResponse.json({ error: safeMsg }, { status: 500 });
    }

    const reviewId = await createContractReview({
      tenantId,
      fileName: file.name,
      storagePath,
      mimeType,
      sizeBytes: file.size,
      processingStatus: "uploaded",
      uploadedBy: user.id,
    });

    await updateContractReview(reviewId, tenantId, {
      processingStatus: "processing",
    });

    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, 3600);
    const fileUrl = signed?.signedUrl ?? null;

    if (!fileUrl) {
      await updateContractReview(reviewId, tenantId, {
        processingStatus: "failed",
        errorMessage: "Nepodařilo se vytvořit odkaz na soubor.",
      });
      return NextResponse.json(
        { error: "Zpracování selhalo." },
        { status: 500 }
      );
    }

    const extraction = await extractContractFromFile(fileUrl);

    if (!extraction.ok) {
      await updateContractReview(reviewId, tenantId, {
        processingStatus: "failed",
        errorMessage: extraction.message,
      });
      logOpenAICall({
        endpoint: "contracts/upload_extraction",
        model: "—",
        latencyMs: Date.now() - start,
        success: false,
        error: maskForLog(extraction.message),
      });
      return NextResponse.json(
        { error: "Extrakce ze smlouvy selhala.", id: reviewId },
        { status: 200 }
      );
    }

    const data = extraction.data;
    const confidence = data.confidence ?? 0.5;
    const needsHumanReview = data.needsHumanReview ?? confidence < 0.7;
    const reasonsForReview: string[] = [];
    if (data.needsHumanReview) reasonsForReview.push("model_flagged");
    if (confidence < 0.7) reasonsForReview.push("low_confidence");
    if (data.missingFields?.length) reasonsForReview.push("missing_fields");

    const draftActions = buildAllDraftActions(data);
    const clientMatchCandidates = await findClientCandidates(data, { tenantId });
    if (isMatchingAmbiguous(clientMatchCandidates)) {
      reasonsForReview.push("ambiguous_client_match");
    }

    await updateContractReview(reviewId, tenantId, {
      processingStatus: needsHumanReview ? "review_required" : "extracted",
      extractedPayload: data,
      draftActions,
      clientMatchCandidates,
      confidence,
      reasonsForReview: reasonsForReview.length ? reasonsForReview : null,
    });

    logOpenAICall({
      endpoint: "contracts/upload_extraction",
      model: "—",
      latencyMs: Date.now() - start,
      success: true,
    });

    return NextResponse.json({
      id: reviewId,
      processingStatus: needsHumanReview ? "review_required" : "extracted",
      confidence,
      needsHumanReview,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json(
      { error: "Nahrání smlouvy selhalo." },
      { status: 500 }
    );
  }
}
