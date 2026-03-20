"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getContractReviewById, updateContractReview } from "@/lib/ai/review-queue-repository";
import { applyContractReview } from "@/lib/ai/apply-contract-review";
import { mapContractReviewToBridgePayload } from "@/lib/ai/contracts-analyses-bridge";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";

export type ContractReviewActionResult =
  | { ok: true; payload?: import("@/lib/ai/review-queue-repository").ApplyResultPayload }
  | { ok: false; error: string };

function canApproveOrReject(processingStatus: string): boolean {
  return (
    processingStatus === "extracted" ||
    processingStatus === "review_required"
  );
}

function canApply(processingStatus: string, reviewStatus: string | null): boolean {
  return (
    (processingStatus === "extracted" || processingStatus === "review_required") &&
    reviewStatus === "approved"
  );
}

export async function approveContractReview(id: string): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  if (!canApproveOrReject(row.processingStatus)) {
    return { ok: false, error: "Položku nelze schválit v aktuálním stavu." };
  }
  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "approved",
    reviewedBy: auth.userId,
    reviewedAt: new Date(),
    rejectReason: null,
  });
  return { ok: true };
}

export async function rejectContractReview(
  id: string,
  reason?: string | null
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  if (!canApproveOrReject(row.processingStatus)) {
    return { ok: false, error: "Položku nelze zamítnout v aktuálním stavu." };
  }
  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "rejected",
    reviewedBy: auth.userId,
    reviewedAt: new Date(),
    rejectReason: reason?.trim() || null,
  });
  return { ok: true };
}

export async function selectMatchedClient(
  reviewId: string,
  clientId: string
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, clientId), eq(contacts.tenantId, auth.tenantId)))
    .limit(1);
  if (!contact) {
    return { ok: false, error: "Klient nenalezen." };
  }
  await updateContractReview(reviewId, auth.tenantId, {
    matchedClientId: clientId,
    createNewClientConfirmed: null,
  });
  return { ok: true };
}

export async function confirmCreateNewClient(reviewId: string): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  await updateContractReview(reviewId, auth.tenantId, {
    matchedClientId: null,
    createNewClientConfirmed: "true",
  });
  return { ok: true };
}

export async function applyContractReviewDrafts(id: string): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (row.reviewStatus === "applied") {
    return { ok: true, payload: row.applyResultPayload ?? undefined };
  }
  if (!canApply(row.processingStatus, row.reviewStatus ?? null)) {
    return {
      ok: false,
      error:
        row.reviewStatus !== "approved"
          ? "Nejprve schvalte položku."
          : "Položku nelze aplikovat v aktuálním stavu.",
    };
  }
  if (row.processingStatus === "failed") {
    return { ok: false, error: "U neúspěšné položky nelze aplikovat akce." };
  }

  const result = await applyContractReview({
    reviewId: id,
    tenantId: auth.tenantId,
    userId: auth.userId,
    row,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const bridgedPayload = mapContractReviewToBridgePayload({
    review: row,
    payload: result.payload,
  });

  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "applied",
    appliedBy: auth.userId,
    appliedAt: new Date(),
    applyResultPayload: bridgedPayload,
  });
  return { ok: true, payload: bridgedPayload };
}
