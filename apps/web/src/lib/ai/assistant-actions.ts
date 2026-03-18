import { db } from "db";
import { contacts } from "db";
import { eq, and } from "drizzle-orm";
import { getContractReviewById } from "./review-queue-repository";
import { listContractReviews } from "./review-queue-repository";
import { getTasksDueAndOverdue } from "./dashboard-priority";
import { getClientAiContext } from "@/lib/client-ai-context";

export type OpenReviewResult =
  | { ok: true; href: string }
  | { ok: false; error: string };

/**
 * Validate review belongs to tenant and return portal href. No DB write.
 */
export async function openReviewItem(
  reviewId: string,
  tenantId: string
): Promise<OpenReviewResult> {
  const row = await getContractReviewById(reviewId, tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  return { ok: true, href: `/portal/contracts/review/${reviewId}` };
}

export type ClientDetailsResult =
  | { ok: true; name: string; email: string | null; phone: string | null }
  | { ok: false; error: string };

/**
 * Get limited client profile for assistant context. Tenant-scoped.
 */
export async function getClientDetails(
  clientId: string,
  tenantId: string
): Promise<ClientDetailsResult> {
  const [row] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(
      and(eq(contacts.id, clientId), eq(contacts.tenantId, tenantId))
    )
    .limit(1);
  if (!row) return { ok: false, error: "Kontakt nenalezen." };
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || "Klient";
  return {
    ok: true,
    name,
    email: row.email ?? null,
    phone: row.phone ?? null,
  };
}

/**
 * Pending contract reviews. Wrapper around listContractReviews.
 */
export async function getPendingReviews(
  tenantId: string,
  filters?: { limit?: number }
) {
  return listContractReviews(tenantId, {
    reviewStatus: "pending",
    limit: filters?.limit ?? 20,
  });
}

/**
 * Urgent tasks (overdue + due today). Tenant-scoped.
 */
export async function getUrgentTasks(tenantId: string) {
  return getTasksDueAndOverdue(tenantId);
}

export type TaskDraft = {
  title: string;
  description?: string;
  contactId?: string;
  dueDate?: string;
};

/**
 * Return draft payload for creating a task. Caller (UI) uses createTask server action with this payload.
 */
export function createTaskDraft(payload: {
  title: string;
  description?: string;
  contactId?: string;
  dueDate?: string;
}): TaskDraft {
  const trimmed = payload.title?.trim();
  return {
    title: trimmed || "Úkol",
    description: payload.description?.trim(),
    contactId: payload.contactId,
    dueDate: payload.dueDate,
  };
}

export type DraftEmailResult =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string };

/**
 * Generate draft email content. Does not send or persist. Caller may copy to clipboard or open mailto.
 * Uses AI-ready client_ai_context view for controlled context (no raw payloads).
 */
export async function draftClientEmail(
  _clientId: string,
  _tenantId: string,
  _payload: { subject?: string; context?: string }
): Promise<DraftEmailResult> {
  let ctx: Awaited<ReturnType<typeof getClientAiContext>> = null;
  try {
    ctx = await getClientAiContext(_clientId, _tenantId);
  } catch {
    // View may not exist yet (migration not applied); fall back to getClientDetails
  }
  if (!ctx) {
    const fallback = await getClientDetails(_clientId, _tenantId);
    if (!fallback.ok) return { ok: false, error: fallback.error };
    const name = fallback.name;
    const bodyText = _payload.context
      ? `Dobrý den,\n\n${_payload.context}\n\nS pozdravem`
      : `Dobrý den, pane/paní ${name},\n\n\n\nS pozdravem`;
    return {
      ok: true,
      subject: _payload.subject ?? `Follow-up – ${name}`,
      body: bodyText,
    };
  }
  const name = ctx.display_name || "Klient";
  const serviceNote =
    ctx.next_service_due
      ? `\n\nPozn.: Servisní termín ${ctx.next_service_due}.`
      : "";
  const bodyText = _payload.context
    ? `Dobrý den,\n\n${_payload.context}${serviceNote}\n\nS pozdravem`
    : `Dobrý den, pane/paní ${name},\n\n\n\n${serviceNote}\n\nS pozdravem`;
  return {
    ok: true,
    subject: _payload.subject ?? `Follow-up – ${name}`,
    body: bodyText,
  };
}
