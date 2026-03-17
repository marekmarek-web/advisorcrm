"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { opportunities, opportunityStages, auditLog } from "db";
import { eq, and, asc } from "db";
import {
  stageToClientStatus,
  getClientStatusLabel,
  type ClientStatusKey,
} from "@/app/lib/client-portal/request-status";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { logActivity } from "./activity";

const CASE_TYPE_LABELS: Record<string, string> = {
  hypotéka: "Hypotéka",
  hypo: "Hypotéka",
  investice: "Investice",
  invest: "Investice",
  pojištění: "Pojištění",
  pojist: "Pojištění",
  úvěr: "Úvěr",
  "změna situace": "Změna životní situace",
  "servis smlouvy": "Servis smlouvy",
  jiné: "Jiné",
};

function caseTypeToLabel(caseType: string): string {
  const n = caseType?.toLowerCase().trim() ?? "";
  return (CASE_TYPE_LABELS[n] ?? caseType) || "Jiné";
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
      contactId: auth.contactId,
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
      contactId: auth.contactId,
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
      meta: { contactId: auth.contactId, caseType: params.caseType },
    });
  } catch {
    // non-fatal
  }

  return { success: true, id: newId };
}
