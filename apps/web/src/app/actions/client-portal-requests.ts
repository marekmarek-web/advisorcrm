"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { newPortalRequestAdvisorTemplate } from "@/lib/email/templates";
import { db } from "db";
import {
  opportunities,
  opportunityStages,
  auditLog,
  contacts,
  tenants,
  advisorNotifications,
} from "db";
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
  const [c] = await db
    .select({ firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, params.tenantId), eq(contacts.id, params.contactId)))
    .limit(1);
  const displayName = c
    ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Klient"
    : "Klient";

  const [tenant] = await db
    .select({ notificationEmail: tenants.notificationEmail })
    .from(tenants)
    .where(eq(tenants.id, params.tenantId))
    .limit(1);
  const email = tenant?.notificationEmail?.trim();
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
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) return [];

  const notifRows = await db
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
    const oppRows = await db
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
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");

  const rows = await db
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

  const [firstStage] = await db
    .select({ id: opportunityStages.id })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder))
    .limit(1);

  if (!firstStage) return { success: false, error: "Žádný krok pipeline není k dispozici. Kontaktujte poradce." };

  const caseTypeLabel = caseTypeToLabel(params.caseType);
  const subjectTrim = params.subject?.trim() ?? "";
  const descTrim = params.description?.trim() ?? "";
  const title = subjectTrim || `Požadavek z portálu: ${caseTypeLabel}`;

  const [row] = await db
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

  const newId = row?.id;
  if (!newId) return { success: false, error: "Nepodařilo se vytvořit požadavek." };

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
    await db.insert(auditLog).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "portal_request_create",
      entityType: "opportunity",
      entityId: newId,
      meta: { contactId, caseType: params.caseType },
    });
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

  return { success: true, id: newId };
}

/**
 * Poradce: nastaví operativní štítek inboxu (Čeká se / Vyřešeno) nebo ho zruší (null).
 */
export async function setAdvisorPortalRequestHandling(
  opportunityId: string,
  handling: AdvisorPortalRequestHandling | null
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) {
    return { success: false, error: "Forbidden" };
  }

  const [row] = await db
    .select({ id: opportunities.id, customFields: opportunities.customFields })
    .from(opportunities)
    .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)))
    .limit(1);

  if (!row) return { success: false, error: "Obchod nebyl nalezen." };

  const custom: Record<string, unknown> = {
    ...((row.customFields as Record<string, unknown> | null) ?? {}),
  };
  const isPortal = custom.client_portal_request === true || custom.client_portal_request === "true";
  if (!isPortal) {
    return { success: false, error: "Tento záznam není požadavkem z klientského portálu." };
  }

  if (handling === null) {
    delete custom[ADVISOR_PORTAL_HANDLING_KEY];
  } else {
    custom[ADVISOR_PORTAL_HANDLING_KEY] = handling;
  }

  await db
    .update(opportunities)
    .set({ customFields: custom, updatedAt: new Date() })
    .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)));

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

  const [row] = await db
    .select({
      id: opportunities.id,
      contactId: opportunities.contactId,
      closedAt: opportunities.closedAt,
      customFields: opportunities.customFields,
    })
    .from(opportunities)
    .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)))
    .limit(1);

  if (!row || row.contactId !== auth.contactId) {
    return { success: false, error: "Požadavek nebyl nalezen." };
  }

  const custom: Record<string, unknown> = {
    ...((row.customFields as Record<string, unknown> | null) ?? {}),
  };
  if (!(custom.client_portal_request === true || custom.client_portal_request === "true")) {
    return { success: false, error: "Tento záznam není požadavkem z portálu." };
  }
  if (row.closedAt) return { success: false, error: "Požadavek už je uzavřený." };

  custom.client_portal_cancelled = true;
  const now = new Date();
  await db
    .update(opportunities)
    .set({
      closedAt: now,
      closedAs: "lost",
      customFields: custom,
      updatedAt: now,
    })
    .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)));

  try {
    await logActivity("opportunity", opportunityId, "update", { source: "client_portal_cancel" });
  } catch {
    /* non-fatal */
  }

  try {
    await db.insert(auditLog).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "portal_request_cancel",
      entityType: "opportunity",
      entityId: opportunityId,
      meta: { contactId: auth.contactId },
    });
  } catch {
    /* non-fatal */
  }

  return { success: true };
}
