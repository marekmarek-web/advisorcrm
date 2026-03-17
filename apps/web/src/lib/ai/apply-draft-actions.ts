import { db } from "db";
import { contacts, contracts, tasks, auditLog } from "db";
import { eq, and } from "drizzle-orm";

export type ApplyDraftActionsInput = {
  tenantId: string;
  userId: string;
  draftActions: Array<{ type: string; label: string; payload: Record<string, unknown> }>;
  sourceReviewId: string;
};

export type ApplyDraftActionsResult =
  | { ok: true }
  | { ok: false; error: string };

/** Idempotent: skip create_client if contact with same email or personalId already exists. Uses tx when inside transaction. */
async function findExistingContactId(
  tenantId: string,
  payload: Record<string, unknown>,
  tx?: typeof db
): Promise<string | null> {
  const runner = tx ?? db;
  const email = (payload.email as string)?.trim();
  const personalId = (payload.personalId as string)?.trim();
  if (email) {
    const byEmail = await runner
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)))
      .limit(1);
    if (byEmail[0]?.id) return byEmail[0].id;
  }
  if (personalId) {
    const byPersonalId = await runner
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.personalId, personalId)))
      .limit(1);
    if (byPersonalId[0]?.id) return byPersonalId[0].id;
  }
  return null;
}

export async function applyDraftActions(input: ApplyDraftActionsInput): Promise<ApplyDraftActionsResult> {
  const { tenantId, userId, draftActions, sourceReviewId } = input;
  let createdContactId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      for (const action of draftActions) {
        if (action.type === "create_client") {
          const existing = await findExistingContactId(tenantId, action.payload, tx as unknown as typeof db);
          if (existing) {
            createdContactId = existing;
            continue;
          }
          const firstName = String(action.payload.firstName ?? "").trim() || "Klient";
          const lastName = String(action.payload.lastName ?? "").trim() || "ze smlouvy";
          const [row] = await tx
            .insert(contacts)
            .values({
              tenantId,
              firstName,
              lastName,
              email: (action.payload.email as string)?.trim() || null,
              phone: (action.payload.phone as string)?.trim() || null,
              birthDate: (action.payload.birthDate as string) || null,
              personalId: (action.payload.personalId as string)?.trim() || null,
              street: (action.payload.address as string)?.trim() || null,
            })
            .returning({ id: contacts.id });
          if (row?.id) createdContactId = row.id;
        } else if (action.type === "create_contract") {
          const contactId = createdContactId;
          if (!contactId) {
            throw new Error("Pro vytvoření smlouvy je potřeba nejdřív vytvořit klienta (create_client).");
          }
          await tx.insert(contracts).values({
            tenantId,
            contactId,
            advisorId: userId,
            segment: "ZP",
            partnerName: (action.payload.institutionName as string) || null,
            productName: (action.payload.productName as string) || null,
            contractNumber: (action.payload.contractNumber as string) || null,
            startDate: (action.payload.effectiveDate as string) || null,
            note: (action.payload.documentType as string) || null,
          });
        } else if (action.type === "create_task") {
          const title = (action.payload.title as string)?.trim() || action.label;
          await tx.insert(tasks).values({
            tenantId,
            contactId: createdContactId,
            title,
            description: (action.payload.notes as string) || null,
            assignedTo: userId,
            createdBy: userId,
          });
        } else if (action.type === "create_payment") {
          // TODO: integrate with payments/invoices table when available
          continue;
        } else if (action.type === "draft_email") {
          // No DB write; UI can open mailto or draft
          continue;
        }
      }
    });

    await db.insert(auditLog).values({
      tenantId,
      userId,
      action: "apply_draft_actions",
      entityType: "contract_review",
      entityId: sourceReviewId,
      meta: { sourceReviewId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aplikace akcí selhala.";
    return { ok: false, error: message };
  }
  return { ok: true };
}
