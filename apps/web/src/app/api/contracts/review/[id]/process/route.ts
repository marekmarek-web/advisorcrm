/**
 * POST /api/contracts/review/[id]/process
 *
 * Spustí AI pipeline (Adobe preprocess → LLM classify + extract → DB matching)
 * pro již nahraný review řádek. Odpověď vrátí hned po zařazení do fronty; práce běží
 * v `after()` — klient polluje GET /api/contracts/review/[id].
 */
import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { assertQuotaAvailable } from "@/lib/billing/subscription-usage";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { createAdminClient } from "@/lib/supabase/server";
import { getContractReviewById, updateContractReview } from "@/lib/ai/review-queue-repository";
import { logAudit, buildRequestContext } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { runContractReviewProcessing } from "@/lib/contracts/run-contract-review-processing";

export const dynamic = "force-dynamic";
/**
 * OpenAI + Adobe může trvat dlouho. `after()` dokončí práci po odpovědi klientovi (krátký POST).
 * Na Vercelu zvyš limit projektu, pokud 120s nestačí (Pro / delší funkce).
 */
export const maxDuration = 300;

const USER_ID_HEADER = "x-user-id";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const processingStartedAtMs = Date.now();
  const { id } = await params;
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

    const limiter = checkRateLimit(request, "contracts-process", `${membership.tenantId}:${userId}`, {
      windowMs: 60_000,
      maxRequests: 15,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků na zpracování. Zkuste to za chvíli." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const tenantId = membership.tenantId;
    const review = await getContractReviewById(id, tenantId);
    if (!review) {
      return NextResponse.json({ error: "Položka nenalezena." }, { status: 404 });
    }

    if (review.processingStatus === "processing") {
      return NextResponse.json({ error: "Zpracování již probíhá.", code: "ALREADY_PROCESSING" }, { status: 409 });
    }
    const canRestart =
      review.processingStatus === "uploaded" ||
      review.processingStatus === "failed" ||
      review.processingStatus === "scan_pending_ocr" ||
      review.processingStatus === "blocked";
    if (!canRestart) {
      return NextResponse.json(
        { error: "Nelze spustit znovu — dokument je již zpracován.", code: "ALREADY_DONE" },
        { status: 409 }
      );
    }

    await updateContractReview(id, tenantId, { processingStatus: "processing" });
    await logAudit({
      tenantId,
      userId,
      action: "extraction_started",
      entityType: "contract_review",
      entityId: id,
      request,
    }).catch(() => {});

    /**
     * Any throw between this point and the end of this `try` block leaves the
     * row stuck in `processing`. We guard with a local try/catch that reverts
     * to `failed` before rethrowing.
     */
    let fileUrl: string | undefined;
    let mimeType: string;
    let storagePath: string;
    let requestContext: ReturnType<typeof buildRequestContext>;

    try {
      const admin = createAdminClient();
      const signed = await createSignedStorageUrl({
        adminClient: admin,
        bucket: "documents",
        path: review.storagePath!,
        purpose: "internal_processing",
      });
      fileUrl = signed.signedUrl ?? undefined;

      if (!fileUrl) {
        await updateContractReview(id, tenantId, {
          processingStatus: "failed",
          errorMessage: "Nepodařilo se vytvořit odkaz na soubor.",
        });
        await logAudit({
          tenantId,
          userId,
          action: "extraction_failed",
          entityType: "contract_review",
          entityId: id,
          request,
          meta: { reason: "no_signed_url" },
        }).catch(() => {});
        return NextResponse.json({ error: "Zpracování selhalo.", code: "NO_SIGNED_URL" }, { status: 500 });
      }

      mimeType = review.mimeType ?? "application/pdf";
      storagePath = review.storagePath!;
      requestContext = buildRequestContext(request);
    } catch (pre) {
      const message = pre instanceof Error ? pre.message : String(pre);
      console.error("[contracts/review/[id]/process] pre-after() setup failed", message);
      await updateContractReview(id, tenantId, {
        processingStatus: "failed",
        errorMessage: "Zpracování smlouvy se nepodařilo spustit.",
      }).catch(() => {});
      await logAudit({
        tenantId,
        userId,
        action: "extraction_failed",
        entityType: "contract_review",
        entityId: id,
        request,
        meta: { reason: "pre_after_setup", message: message.slice(0, 200) },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Zpracování selhalo při inicializaci.", code: "PROCESS_PRE_AFTER" },
        { status: 500 },
      );
    }

    const SAFETY_TIMEOUT_MS = (maxDuration - 15) * 1000;

    after(async () => {
      let safetyTimer: ReturnType<typeof setTimeout> | undefined;
      const safetyPromise = new Promise<"timeout">((resolve) => {
        safetyTimer = setTimeout(() => resolve("timeout"), SAFETY_TIMEOUT_MS);
      });

      const processingPromise = (async () => {
        try {
          await runContractReviewProcessing({
            id,
            userId,
            tenantId,
            fileUrl,
            mimeType,
            storagePath,
            requestContext,
            processingStartedAtMs,
            userDeclaredDocumentIntent: review.userDeclaredDocumentIntent,
          });
          return "done" as const;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[contracts/review/[id]/process] after() processing failed", message);
          await updateContractReview(id, tenantId, {
            processingStatus: "failed",
            errorMessage: "Zpracování smlouvy selhalo (neočekávaná chyba).",
          }).catch(() => {});
          await logAudit({
            tenantId,
            userId,
            action: "extraction_failed",
            entityType: "contract_review",
            entityId: id,
            requestContext,
            meta: { reason: "after_unhandled", message: message.slice(0, 200) },
          }).catch(() => {});
          return "error" as const;
        }
      })();

      const result = await Promise.race([processingPromise, safetyPromise]);
      if (safetyTimer) clearTimeout(safetyTimer);

      if (result === "timeout") {
        console.error("[contracts/review/[id]/process] safety timeout – marking as failed", { id, elapsedMs: Date.now() - processingStartedAtMs });
        await updateContractReview(id, tenantId, {
          processingStatus: "failed",
          errorMessage: "Zpracování překročilo časový limit serveru. Zkuste to prosím znovu.",
        }).catch(() => {});
        await logAudit({
          tenantId,
          userId,
          action: "extraction_failed",
          entityType: "contract_review",
          entityId: id,
          requestContext,
          meta: { reason: "safety_timeout", elapsedMs: Date.now() - processingStartedAtMs },
        }).catch(() => {});
      }
    });

    return NextResponse.json({
      id,
      processingStatus: "processing",
      accepted: true,
      message: "Zpracování běží na pozadí. Stav se obnoví automaticky.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[contracts/review/[id]/process] 500", message);
    return NextResponse.json(
      { error: "Zpracování smlouvy selhalo.", code: "PROCESS_UNHANDLED" },
      { status: 500 }
    );
  }
}
