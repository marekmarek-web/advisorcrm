import { NextResponse } from "next/server";
import { faPlanItems, financialAnalyses, tasks, eq, and, isNull, lte, sql } from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { cronAuthResponse } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IN_PROGRESS_DAYS = 14;
const WAITING_SIGNATURE_DAYS = 7;
/** Reminder threshold only — `financial_analyses` rows are never deleted by this cron. */
const DRAFT_DAYS = 30;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  let tasksCreated = 0;

  const inProgressCutoff = new Date();
  inProgressCutoff.setDate(inProgressCutoff.getDate() - IN_PROGRESS_DAYS);
  const staleInProgress = await dbService
    .select({
      id: faPlanItems.id,
      tenantId: faPlanItems.tenantId,
      analysisId: faPlanItems.analysisId,
      contactId: faPlanItems.contactId,
      label: faPlanItems.label,
    })
    .from(faPlanItems)
    .where(
      and(
        eq(faPlanItems.status, "in_progress"),
        lte(faPlanItems.updatedAt, inProgressCutoff)
      )
    );

  for (const item of staleInProgress) {
    if (!item.contactId) continue;
    await withServiceTenantContext({ tenantId: item.tenantId }, async (tx) => {
      const existing = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, item.tenantId),
            eq(tasks.analysisId, item.analysisId),
            sql`${tasks.title} LIKE ${"Follow-up: %" + (item.label ?? "").slice(0, 30) + "%"}`
          )
        )
        .limit(1);
      if (existing.length > 0) return;

      await tx.insert(tasks).values({
        tenantId: item.tenantId,
        contactId: item.contactId!,
        analysisId: item.analysisId,
        title: `Follow-up: ${item.label ?? "položka z FA"}`,
        description: `Rozjednaný produkt z finanční analýzy je starší než ${IN_PROGRESS_DAYS} dní bez aktualizace.`,
      });
      tasksCreated++;
    });
  }

  const waitingCutoff = new Date();
  waitingCutoff.setDate(waitingCutoff.getDate() - WAITING_SIGNATURE_DAYS);
  const staleWaiting = await dbService
    .select({
      id: faPlanItems.id,
      tenantId: faPlanItems.tenantId,
      analysisId: faPlanItems.analysisId,
      contactId: faPlanItems.contactId,
      label: faPlanItems.label,
      provider: faPlanItems.provider,
    })
    .from(faPlanItems)
    .where(
      and(
        eq(faPlanItems.status, "waiting_signature"),
        lte(faPlanItems.updatedAt, waitingCutoff)
      )
    );

  for (const item of staleWaiting) {
    if (!item.contactId) continue;
    await withServiceTenantContext({ tenantId: item.tenantId }, async (tx) => {
      const existing = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, item.tenantId),
            eq(tasks.analysisId, item.analysisId),
            sql`${tasks.title} LIKE ${"Chybí smlouva: %" + (item.provider ?? item.label ?? "").slice(0, 30) + "%"}`
          )
        )
        .limit(1);
      if (existing.length > 0) return;

      await tx.insert(tasks).values({
        tenantId: item.tenantId,
        contactId: item.contactId!,
        analysisId: item.analysisId,
        title: `Chybí smlouva: ${item.provider ?? item.label ?? "produkt z FA"}`,
        description: `Produkt čeká na podpis/smlouvu déle než ${WAITING_SIGNATURE_DAYS} dní.`,
      });
      tasksCreated++;
    });
  }

  const draftCutoff = new Date();
  draftCutoff.setDate(draftCutoff.getDate() - DRAFT_DAYS);
  const staleDrafts = await dbService
    .select({
      id: financialAnalyses.id,
      tenantId: financialAnalyses.tenantId,
      contactId: financialAnalyses.contactId,
      payload: financialAnalyses.payload,
    })
    .from(financialAnalyses)
    .where(
      and(
        eq(financialAnalyses.status, "draft"),
        lte(financialAnalyses.updatedAt, draftCutoff)
      )
    );

  for (const draft of staleDrafts) {
    if (!draft.contactId) continue;
    await withServiceTenantContext({ tenantId: draft.tenantId }, async (tx) => {
      const existing = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, draft.tenantId),
            eq(tasks.analysisId, draft.id),
            isNull(tasks.completedAt)
          )
        )
        .limit(1);
      if (existing.length > 0) return;

      const clientName = (draft.payload as { data?: { client?: { name?: string } } })?.data?.client?.name ?? "klient";
      await tx.insert(tasks).values({
        tenantId: draft.tenantId,
        contactId: draft.contactId!,
        analysisId: draft.id,
        title: `Dokončit finanční analýzu: ${clientName}`,
        description: `Analýza je v draftu déle než ${DRAFT_DAYS} dní.`,
      });
      tasksCreated++;
    });
  }

  return NextResponse.json({ ok: true, tasksCreated });
}
