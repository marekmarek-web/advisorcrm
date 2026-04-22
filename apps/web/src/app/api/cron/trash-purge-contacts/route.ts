import { NextResponse } from "next/server";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { cronAuthResponse } from "@/lib/cron-auth";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { contacts, auditLog } from "db";

/**
 * Delta A21 — trash purge cron.
 *
 * Denně prochází `contacts.deleted_at` a hard-deletuje kontakty, které jsou v trashi
 * déle než 30 dnů. Hard-delete přes CASCADE / SET NULL spustí kaskádu na:
 *   - contracts, payments, documents (file storage NENÍ v této cron trase čištěn —
 *     storage cleanup se stane během trashování; při purge už jsou jen DB rows).
 *   - messages, meeting_notes, opportunities, timeline_items, ...
 *
 * Idempotence: po úspěšném DELETE již row neexistuje, takže další běh nic nedělá.
 * Audit: pro každý smazaný contact_id zapíšeme `contact.purge_from_trash` entry.
 *
 * Scheduled: `vercel.json` → `{ path: "/api/cron/trash-purge-contacts", schedule: "0 3 * * *" }`.
 * (3:00 UTC — nízký provoz, izolované od ostatních cronů.)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TRASH_RETENTION_DAYS = 30;
const BATCH_SIZE = 200;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const threshold = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400_000);

  const due = await dbService
    .select({
      id: contacts.id,
      tenantId: contacts.tenantId,
      deletedAt: contacts.deletedAt,
      deletedBy: contacts.deletedBy,
    })
    .from(contacts)
    .where(and(isNotNull(contacts.deletedAt), lte(contacts.deletedAt, threshold)))
    .limit(BATCH_SIZE);

  if (due.length === 0) {
    return NextResponse.json({ ok: true, purged: 0, threshold: threshold.toISOString() });
  }

  let purged = 0;
  const errors: Array<{ contactId: string; error: string }> = [];

  for (const row of due) {
    try {
      await withServiceTenantContext({ tenantId: row.tenantId, userId: row.deletedBy ?? null }, async (tx) => {
        await tx
          .delete(contacts)
          .where(and(eq(contacts.tenantId, row.tenantId), eq(contacts.id, row.id)));

        await tx.insert(auditLog).values({
          tenantId: row.tenantId,
          userId: row.deletedBy ?? "system",
          action: "contact.purge_from_trash",
          entityType: "contact",
          entityId: row.id,
          meta: {
            deletedAt: row.deletedAt?.toISOString() ?? null,
            retentionDays: TRASH_RETENTION_DAYS,
            source: "cron.trash_purge_contacts",
          },
        });
      });

      purged += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ contactId: row.id, error: msg });
      console.error("[cron.trash_purge_contacts] purge failed", row.id, msg);
    }
  }

  return NextResponse.json({
    ok: true,
    purged,
    errors,
    threshold: threshold.toISOString(),
    batchTotal: due.length,
    batchHadMore: due.length >= BATCH_SIZE,
    // Pokud batchHadMore=true, příští cron run pokračuje — max 200 kontaktů za běh
    // brání timeoutu při obřím backlog.
    sql: sql`/* cron trash purge — see contacts.deleted_at < ${threshold.toISOString()} */`.toString(),
  });
}
