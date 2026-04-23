"use server";

import { revalidatePath } from "next/cache";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { newPortalRequestAdvisorTemplate } from "@/lib/email/templates";
import {
  opportunities,
  opportunityStages,
  auditLog,
  contacts,
  tenants,
  advisorNotifications,
  documents,
} from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyAdvisorClientTrezorUpload } from "@/lib/client-portal/notify-advisor-client-self-service";
import { eq, and, ne, asc, desc, inArray } from "db";
import {
  stageToClientStatus,
  getClientStatusLabel,
  type ClientStatusKey,
} from "@/app/lib/client-portal/request-status";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { logActivity } from "./activity";
import { caseTypeToLabel } from "@/lib/client-portal/case-type-labels";
import { getTargetAdvisorUserIdForContact } from "@/app/actions/client-dashboard";
import { getPortalRequestDisplayFields } from "@/lib/client-portal/portal-request-display";
import { parseClientPortalNotificationBody } from "@/lib/advisor-in-app/parse-client-portal-notification-body";
import {
  ADVISOR_PORTAL_HANDLING_KEY,
  parseAdvisorPortalHandling,
  type AdvisorPortalRequestHandling,
} from "@/lib/client-portal/advisor-portal-handling";
import { assertCapabilityForAction } from "@/lib/billing/server-action-plan-guard";
import { PlanAccessError } from "@/lib/billing/plan-access-errors";

async function notifyAdvisorNewPortalRequest(params: {
  tenantId: string;
  contactId: string;
  opportunityId: string;
  caseType: string;
  caseTypeLabel: string;
  descriptionPreview: string;
}): Promise<void> {
  /**
   * Helper běží fire-and-forget (`.catch(() => {})`) z `createClientPortalRequest`,
   * takže auth už nemá — nastavíme tenant GUC explicitně kolem DB čtení, aby projdeme
   * RLS policy tvaru `tenant_id = current_setting('app.tenant_id', true)::uuid`.
   */
  const { displayName, notificationEmail } = await withTenantContextFromAuth(
    { tenantId: params.tenantId, userId: null },
    async (tx) => {
      const [c] = await tx
        .select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.tenantId, params.tenantId), eq(contacts.id, params.contactId)))
        .limit(1);
      const displayName = c
        ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Klient"
        : "Klient";

      const [tenant] = await tx
        .select({ notificationEmail: tenants.notificationEmail })
        .from(tenants)
        .where(eq(tenants.id, params.tenantId))
        .limit(1);
      return { displayName, notificationEmail: tenant?.notificationEmail ?? null };
    },
  );
  const email = notificationEmail?.trim();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.aidvisora.cz");
  const pipelineUrl = `${baseUrl}/portal/pipeline/${params.opportunityId}`;
  const { subject, html } = newPortalRequestAdvisorTemplate({
    contactName: displayName,
    caseTypeLabel: params.caseTypeLabel,
    descriptionPreview: params.descriptionPreview || "(bez popisu)",
    pipelineUrl,
  });

  if (email) {
    const result = await sendEmail({ to: email, subject, html });
    await logNotification({
      tenantId: params.tenantId,
      contactId: params.contactId,
      template: "new_portal_request_advisor",
      subject,
      recipient: email,
      status: result.ok ? "sent" : (result.error ?? "failed"),
    });
  } else {
    await logNotification({
      tenantId: params.tenantId,
      contactId: params.contactId,
      template: "new_portal_request_advisor",
      subject,
      recipient: "",
      status: "skipped_no_email",
    });
  }

  const targetUserId = await getTargetAdvisorUserIdForContact(params.tenantId, params.contactId);
  if (targetUserId) {
    try {
      const { emitNotification } = await import("@/lib/execution/notification-center");
      const body = JSON.stringify({
        caseType: params.caseType,
        caseTypeLabel: params.caseTypeLabel,
        preview: params.descriptionPreview || "",
        contactId: params.contactId,
      });
      await emitNotification({
        tenantId: params.tenantId,
        type: "client_portal_request",
        title: displayName,
        body,
        severity: "info",
        targetUserId,
        channels: ["in_app"],
        relatedEntityType: "opportunity",
        relatedEntityId: params.opportunityId,
      });
    } catch {
      /* best-effort */
    }
  } else if (process.env.NODE_ENV === "development") {
    console.warn(
      "[notifyAdvisorNewPortalRequest] Přeskakuji in-app notifikaci — chybí cílový poradce (getTargetAdvisorUserIdForContact).",
      { tenantId: params.tenantId, contactId: params.contactId, opportunityId: params.opportunityId }
    );
  }
}

const CLIENT_PORTAL_NOTIFICATION_TYPE = "client_portal_request";

function inboxStatusLabelForAdvisor(
  custom: Record<string, unknown>,
  sortOrder: number,
  closedAt: Date | null
): { statusKey: ClientStatusKey; statusLabel: string } {
  const statusKey = stageToClientStatus(sortOrder, closedAt, custom);
  if (custom.client_portal_cancelled === true || custom.client_portal_cancelled === "true") {
    return { statusKey, statusLabel: getClientStatusLabel("cancelled") };
  }
  const h = parseAdvisorPortalHandling(custom);
  if (h === "waiting") return { statusKey, statusLabel: "Čeká se" };
  if (h === "resolved") return { statusKey, statusLabel: "Vyřešeno" };
  return { statusKey, statusLabel: getClientStatusLabel(statusKey) };
}

export type AdvisorClientPortalInboxItem = {
  notificationId: string;
  notificationStatus: string;
  notificationCreatedAt: Date;
  opportunityId: string | null;
  contactId: string | null;
  clientName: string;
  caseType: string;
  caseTypeLabel: string;
  subject: string;
  preview: string;
  bodyText: string | null;
  statusKey: ClientStatusKey;
  statusLabel: string;
  /** Null = zobrazený stav vychází z pipeline / uzavření, ne z ručního štítku. */
  advisorHandling: AdvisorPortalRequestHandling | null;
  opportunityMissing: boolean;
};

/**
 * Inbox klientských požadavků pro přihlášeného poradce (in-app notifikace + opportunity).
 */
export async function getAdvisorClientPortalRequestsInbox(): Promise<AdvisorClientPortalInboxItem[]> {
  const { notifRows, oppMap } = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "opportunities:read")) {
      return { notifRows: [] as Array<{
        id: string;
        title: string;
        status: string;
        createdAt: Date;
        body: string | null;
        relatedEntityType: string | null;
        relatedEntityId: string | null;
      }>, oppMap: new Map<string, never>() };
    }

    const notifRows = await tx
      .select({
        id: advisorNotifications.id,
        title: advisorNotifications.title,
        status: advisorNotifications.status,
        createdAt: advisorNotifications.createdAt,
        body: advisorNotifications.body,
        relatedEntityType: advisorNotifications.relatedEntityType,
        relatedEntityId: advisorNotifications.relatedEntityId,
      })
      .from(advisorNotifications)
      .where(
        and(
          eq(advisorNotifications.tenantId, auth.tenantId),
          eq(advisorNotifications.targetUserId, auth.userId),
          eq(advisorNotifications.type, CLIENT_PORTAL_NOTIFICATION_TYPE),
          ne(advisorNotifications.status, "dismissed")
        )
      )
      .orderBy(desc(advisorNotifications.createdAt))
      .limit(100);

    const oppIds = notifRows
      .map((n) => (n.relatedEntityType === "opportunity" ? n.relatedEntityId : null))
      .filter((id): id is string => Boolean(id));

    const oppMap = new Map<
      string,
      {
        id: string;
        title: string;
        caseType: string | null;
        contactId: string | null;
        customFields: unknown;
        closedAt: Date | null;
        updatedAt: Date | null;
        sortOrder: number | null;
        firstName: string | null;
        lastName: string | null;
      }
    >();

    if (oppIds.length > 0) {
      const oppRows = await tx
        .select({
          id: opportunities.id,
          title: opportunities.title,
          caseType: opportunities.caseType,
          contactId: opportunities.contactId,
          customFields: opportunities.customFields,
          closedAt: opportunities.closedAt,
          updatedAt: opportunities.updatedAt,
          sortOrder: opportunityStages.sortOrder,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(opportunities)
        .innerJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
        .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
        .where(and(eq(opportunities.tenantId, auth.tenantId), inArray(opportunities.id, oppIds)));

      for (const r of oppRows) {
        oppMap.set(r.id, r);
      }
    }

    return { notifRows, oppMap };
  });

  return notifRows.map((n) => {
    const oppId = n.relatedEntityType === "opportunity" ? n.relatedEntityId : null;
    const opp = oppId ? oppMap.get(oppId) : undefined;
    const meta = parseClientPortalNotificationBody(n.body);

    if (!opp) {
      const preview = meta.preview || "";
      const nameFromNotif = n.title?.trim() || "";
      return {
        notificationId: n.id,
        notificationStatus: n.status,
        notificationCreatedAt: n.createdAt,
        opportunityId: oppId,
        contactId: null,
        clientName: nameFromNotif || "Klient",
        caseType: meta.caseType,
        caseTypeLabel: meta.caseTypeLabel || caseTypeToLabel(meta.caseType),
        subject: meta.caseTypeLabel || "Požadavek z portálu",
        preview: preview.slice(0, 280) || "—",
        bodyText: preview || null,
        statusKey: "accepted" as ClientStatusKey,
        statusLabel: getClientStatusLabel("accepted"),
        advisorHandling: null,
        opportunityMissing: true,
      };
    }

    const custom = (opp.customFields as Record<string, unknown> | null) ?? {};
    const clientName = [opp.firstName, opp.lastName].filter(Boolean).join(" ").trim() || "Klient";
    const { subject, body, preview } = getPortalRequestDisplayFields(custom, opp.title, opp.caseType);

    const { statusKey, statusLabel } = inboxStatusLabelForAdvisor(custom, opp.sortOrder ?? 0, opp.closedAt ?? null);

    return {
      notificationId: n.id,
      notificationStatus: n.status,
      notificationCreatedAt: n.createdAt,
      opportunityId: opp.id,
      contactId: opp.contactId,
      clientName,
      caseType: opp.caseType ?? meta.caseType,
      caseTypeLabel: caseTypeToLabel(opp.caseType ?? meta.caseType),
      subject,
      preview,
      bodyText: body,
      statusKey,
      statusLabel,
      advisorHandling: parseAdvisorPortalHandling(custom),
      opportunityMissing: false,
    };
  });
}

/**
 * Seznam požadavků (opportunities) pro přihlášeného klienta.
 * Pouze pro roli Client, pouze vlastní contactId.
 * Vrací klientské stavy, ne interní stage.
 */
export async function getClientRequests(): Promise<ClientRequestItem[]> {
  const rows = await withAuthContext(async (auth, tx) => {
    if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");
    return tx
      .select({
        id: opportunities.id,
        title: opportunities.title,
        caseType: opportunities.caseType,
        closedAt: opportunities.closedAt,
        updatedAt: opportunities.updatedAt,
        customFields: opportunities.customFields,
        sortOrder: opportunityStages.sortOrder,
      })
      .from(opportunities)
      .innerJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
      .where(
        and(
          eq(opportunities.tenantId, auth.tenantId),
          eq(opportunities.contactId, auth.contactId)
        )
      )
      .orderBy(desc(opportunities.updatedAt));
  });

  return rows
    .filter((r) => {
      const c = (r.customFields as Record<string, unknown> | null)?.client_portal_request;
      return c === true || c === "true";
    })
    .map((r) => {
      const custom = (r.customFields as Record<string, unknown> | null) ?? {};
      const statusKey = stageToClientStatus(r.sortOrder ?? 0, r.closedAt ?? null, custom);
      const { subject, body } = getPortalRequestDisplayFields(custom, r.title, r.caseType);
      return {
        id: r.id,
        title: subject,
        caseTypeLabel: caseTypeToLabel(r.caseType ?? ""),
        statusKey,
        statusLabel: getClientStatusLabel(statusKey),
        updatedAt: r.updatedAt,
        description: body,
      };
    });
}

/**
 * Vytvoří nový požadavek z klientského portálu → opportunity v CRM.
 * Pouze role Client, contactId z auth. První stage (Lead) podle sortOrder.
 */
export async function createClientPortalRequest(params: {
  caseType: string;
  /** Předmět / název požadavku (stejné pole jako v klientském průvodci). */
  subject?: string | null;
  description?: string | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  const canCreate =
    auth.roleName === "Client" &&
    auth.contactId &&
    (hasPermission(auth.roleName, "client_zone:request_create") ||
      hasPermission(auth.roleName, "client_zone:*"));
  if (!canCreate) return { success: false, error: "Forbidden" };
  const contactId = auth.contactId;
  if (!contactId) return { success: false, error: "Forbidden" };

  try {
    await assertCapabilityForAction(auth, "client_portal_service_requests");
  } catch (e) {
    if (PlanAccessError.is(e)) return { success: false, error: e.message };
    throw e;
  }

  const caseTypeLabel = caseTypeToLabel(params.caseType);
  const subjectTrim = params.subject?.trim() ?? "";
  const descTrim = params.description?.trim() ?? "";
  const title = subjectTrim || `Požadavek z portálu: ${caseTypeLabel}`;

  const result = await withTenantContextFromAuth(auth, async (tx) => {
    const [firstStage] = await tx
      .select({ id: opportunityStages.id })
      .from(opportunityStages)
      .where(eq(opportunityStages.tenantId, auth.tenantId))
      .orderBy(asc(opportunityStages.sortOrder))
      .limit(1);

    if (!firstStage) return { kind: "no_stage" as const };

    const [row] = await tx
      .insert(opportunities)
      .values({
        tenantId: auth.tenantId,
        contactId,
        title: title.trim(),
        caseType: params.caseType.trim() || "jiné",
        stageId: firstStage.id,
        customFields: {
          client_portal_request: true,
          client_request_subject: subjectTrim || null,
          client_description: descTrim || null,
        },
      })
      .returning({ id: opportunities.id });

    if (!row) return { kind: "insert_failed" as const };
    return { kind: "ok" as const, id: row.id };
  });

  if (result.kind === "no_stage") {
    return { success: false, error: "Žádný krok pipeline není k dispozici. Kontaktujte poradce." };
  }
  if (result.kind === "insert_failed") {
    return { success: false, error: "Nepodařilo se vytvořit požadavek." };
  }
  const newId = result.id;

  try {
    await logActivity("opportunity", newId, "create", {
      title,
      contactId,
      source: "client_portal",
    });
  } catch {
    // non-fatal
  }

  try {
    await withTenantContextFromAuth(auth, (tx) =>
      tx.insert(auditLog).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "portal_request_create",
        entityType: "opportunity",
        entityId: newId,
        meta: { contactId, caseType: params.caseType },
      }),
    );
  } catch {
    // non-fatal
  }

  const previewBits = [subjectTrim, descTrim].filter(Boolean);
  notifyAdvisorNewPortalRequest({
    tenantId: auth.tenantId,
    contactId,
    opportunityId: newId,
    caseType: params.caseType.trim() || "jiné",
    caseTypeLabel,
    descriptionPreview: previewBits.join(" — ") || "",
  }).catch(() => {});

  try {
    revalidatePath("/client/requests");
    revalidatePath("/client");
  } catch {
    /* ignore */
  }

  return { success: true, id: newId };
}

const PORTAL_REQUEST_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const PORTAL_REQUEST_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ClientPortalAttachmentOutcome = {
  fileName: string;
  status: "uploaded" | "too_large" | "bad_type" | "upload_failed" | "db_failed";
};

async function persistClientPortalRequestFiles(
  opportunityId: string,
  files: File[],
): Promise<ClientPortalAttachmentOutcome[]> {
  if (files.length === 0) return [];
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) {
    return files.map((f) => ({ fileName: f.name, status: "upload_failed" as const }));
  }
  const clientContactId = auth.contactId;

  const oppExists = await withTenantContextFromAuth(auth, async (tx) => {
    const [opp] = await tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, auth.tenantId),
          eq(opportunities.id, opportunityId),
          eq(opportunities.contactId, clientContactId),
        ),
      )
      .limit(1);
    return Boolean(opp);
  });
  if (!oppExists) {
    return files.map((f) => ({ fileName: f.name, status: "upload_failed" as const }));
  }

  const outcomes: ClientPortalAttachmentOutcome[] = [];
  const admin = createAdminClient();
  for (const file of files) {
    if (!(file instanceof File) || !file.size) continue;
    if (file.size > PORTAL_REQUEST_ATTACHMENT_MAX_BYTES) {
      outcomes.push({ fileName: file.name, status: "too_large" });
      continue;
    }
    if (!PORTAL_REQUEST_ATTACHMENT_MIMES.has(file.type)) {
      outcomes.push({ fileName: file.name, status: "bad_type" });
      continue;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${auth.tenantId}/${clientContactId}/portal-request-${opportunityId}-${Date.now()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, file, { upsert: false });
    if (uploadError) {
      console.error("[client-portal-request] upload failed", file.name, uploadError);
      outcomes.push({ fileName: file.name, status: "upload_failed" });
      continue;
    }

    try {
      const documentId = await withTenantContextFromAuth(auth, async (tx) => {
        const [docRow] = await tx
          .insert(documents)
          .values({
            tenantId: auth.tenantId,
            contactId: clientContactId,
            contractId: null,
            opportunityId,
            name: file.name,
            storagePath,
            tags: ["požadavek portálu"],
            mimeType: file.type || null,
            sizeBytes: file.size,
            visibleToClient: true,
            uploadSource: "web",
            uploadedBy: auth.userId,
          })
          .returning({ id: documents.id });
        return docRow?.id ?? null;
      });

      if (!documentId) {
        outcomes.push({ fileName: file.name, status: "db_failed" });
        continue;
      }

      await logActivity("document", documentId, "upload", {
        contactId: clientContactId,
        opportunityId,
        source: "client_portal_request",
      }).catch(() => {});
      await notifyAdvisorClientTrezorUpload({
        tenantId: auth.tenantId,
        contactId: clientContactId,
        documentId,
        documentLabel: file.name,
      }).catch(() => {});

      outcomes.push({ fileName: file.name, status: "uploaded" });
    } catch (err) {
      console.error("[client-portal-request] document insert failed", file.name, err);
      outcomes.push({ fileName: file.name, status: "db_failed" });
    }
  }
  return outcomes;
}

/**
 * Vytvoří požadavek z portálu včetně volitelných příloh (`files` v `FormData`).
 */
export async function createClientPortalRequestFromForm(
  formData: FormData
): Promise<
  | { success: true; id: string; attachments?: ClientPortalAttachmentOutcome[] }
  | { success: false; error: string }
> {
  const caseType = String(formData.get("caseType") ?? "").trim();
  const subjectRaw = formData.get("subject");
  const descriptionRaw = formData.get("description");
  const subject = typeof subjectRaw === "string" ? subjectRaw.trim() || null : null;
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() || null : null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  const created = await createClientPortalRequest({
    caseType: caseType || "jiné",
    subject,
    description,
  });
  if (!created.success) return created;

  const attachments = await persistClientPortalRequestFiles(created.id, files);
  return { ...created, attachments };
}

/**
 * Poradce: nastaví operativní štítek inboxu (Čeká se / Vyřešeno) nebo ho zruší (null).
 */
export async function setAdvisorPortalRequestHandling(
  opportunityId: string,
  handling: AdvisorPortalRequestHandling | null
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "opportunities:write")) {
      return { kind: "forbidden" as const };
    }

    const [row] = await tx
      .select({ id: opportunities.id, customFields: opportunities.customFields })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)))
      .limit(1);

    if (!row) return { kind: "not_found" as const };

    const custom: Record<string, unknown> = {
      ...((row.customFields as Record<string, unknown> | null) ?? {}),
    };
    const isPortal = custom.client_portal_request === true || custom.client_portal_request === "true";
    if (!isPortal) return { kind: "not_portal" as const };

    if (handling === null) {
      delete custom[ADVISOR_PORTAL_HANDLING_KEY];
    } else {
      custom[ADVISOR_PORTAL_HANDLING_KEY] = handling;
    }

    await tx
      .update(opportunities)
      .set({ customFields: custom, updatedAt: new Date() })
      .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)));

    /**
     * Když poradce označí portálový požadavek jako vyřešený, nemá smysl držet
     * "unread" odznak na zvonku. Auto-read příslušné advisor_notifications řádky, aby
     * se badge vyčistil. Pro ostatní stavy (waiting, null) necháváme status být.
     */
    if (handling === "resolved") {
      try {
        await tx
          .update(advisorNotifications)
          .set({ status: "read", readAt: new Date() })
          .where(
            and(
              eq(advisorNotifications.tenantId, auth.tenantId),
              eq(advisorNotifications.relatedEntityType, "opportunity"),
              eq(advisorNotifications.relatedEntityId, opportunityId),
              eq(advisorNotifications.status, "unread")
            )
          );
      } catch {
        /* non-fatal */
      }
    }

    return { kind: "ok" as const };
  });

  if (result.kind === "forbidden") return { success: false, error: "Forbidden" };
  if (result.kind === "not_found") return { success: false, error: "Obchod nebyl nalezen." };
  if (result.kind === "not_portal") {
    return { success: false, error: "Tento záznam není požadavkem z klientského portálu." };
  }

  try {
    await logActivity("opportunity", opportunityId, "update", {
      source: "advisor_portal_handling",
      handling,
    });
  } catch {
    /* non-fatal */
  }

  return { success: true };
}

/**
 * Klient zruší vlastní požadavek z portálu → uzavření obchodu s příznakem v customFields.
 */
export async function cancelClientPortalRequest(
  opportunityId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  const canCancel =
    auth.roleName === "Client" &&
    auth.contactId &&
    (hasPermission(auth.roleName, "client_zone:request_cancel") ||
      hasPermission(auth.roleName, "client_zone:*"));
  if (!canCancel || !auth.contactId) return { success: false, error: "Forbidden" };
  const clientContactId = auth.contactId;

  const result = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({
        id: opportunities.id,
        contactId: opportunities.contactId,
        closedAt: opportunities.closedAt,
        customFields: opportunities.customFields,
      })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)))
      .limit(1);

    if (!row || row.contactId !== clientContactId) return { kind: "not_found" as const };

    const custom: Record<string, unknown> = {
      ...((row.customFields as Record<string, unknown> | null) ?? {}),
    };
    if (!(custom.client_portal_request === true || custom.client_portal_request === "true")) {
      return { kind: "not_portal" as const };
    }
    if (row.closedAt) return { kind: "already_closed" as const };

    custom.client_portal_cancelled = true;
    const now = new Date();
    await tx
      .update(opportunities)
      .set({
        closedAt: now,
        closedAs: "lost",
        customFields: custom,
        updatedAt: now,
      })
      .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)));

    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") return { success: false, error: "Požadavek nebyl nalezen." };
  if (result.kind === "not_portal") return { success: false, error: "Tento záznam není požadavkem z portálu." };
  if (result.kind === "already_closed") return { success: false, error: "Požadavek už je uzavřený." };

  try {
    await logActivity("opportunity", opportunityId, "update", { source: "client_portal_cancel" });
  } catch {
    /* non-fatal */
  }

  try {
    await withTenantContextFromAuth(auth, (tx) =>
      tx.insert(auditLog).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "portal_request_cancel",
        entityType: "opportunity",
        entityId: opportunityId,
        meta: { contactId: clientContactId },
      }),
    );
  } catch {
    /* non-fatal */
  }

  return { success: true };
}
