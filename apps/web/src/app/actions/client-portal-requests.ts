"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { newPortalRequestAdvisorTemplate } from "@/lib/email/templates";
import { db } from "db";
import { opportunities, opportunityStages, auditLog, contacts, tenants } from "db";
import { eq, and, asc } from "db";
import {
  stageToClientStatus,
  getClientStatusLabel,
  type ClientStatusKey,
} from "@/app/lib/client-portal/request-status";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { logActivity } from "./activity";
import { caseTypeToLabel } from "@/lib/client-portal/case-type-labels";
import { getTargetAdvisorUserIdForContact } from "@/app/actions/client-dashboard";

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
  }
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
      )    )
    .orderBy(asc(opportunityStages.sortOrder));

  return rows.map((r) => {
    const statusKey = stageToClientStatus(
      r.sortOrder ?? 0,
      r.closedAt ?? null
    );
    const custom = (r.customFields as Record<string, unknown> | null) ?? {};
    const description = (custom.client_description as string) ?? null;
    return {
      id: r.id,
      title: r.title,
      caseTypeLabel: caseTypeToLabel(r.caseType ?? ""),
      statusKey,
      statusLabel: getClientStatusLabel(statusKey),
      updatedAt: r.updatedAt,
      description: description || null,
    };
  });
}

/**
 * Vytvoří nový požadavek z klientského portálu → opportunity v CRM.
 * Pouze role Client, contactId z auth. První stage (Lead) podle sortOrder.
 */
export async function createClientPortalRequest(params: {
  caseType: string;
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

  const [firstStage] = await db
    .select({ id: opportunityStages.id })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder))
    .limit(1);

  if (!firstStage) return { success: false, error: "Žádný krok pipeline není k dispozici. Kontaktujte poradce." };

  const caseTypeLabel = caseTypeToLabel(params.caseType);
  const title = `Požadavek z portálu: ${caseTypeLabel}`;

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
        client_description: params.description?.trim() ?? null,
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

  notifyAdvisorNewPortalRequest({
    tenantId: auth.tenantId,
    contactId,
    opportunityId: newId,
    caseType: params.caseType.trim() || "jiné",
    caseTypeLabel,
    descriptionPreview: params.description?.trim() ?? "",
  }).catch(() => {});

  return { success: true, id: newId };
}
