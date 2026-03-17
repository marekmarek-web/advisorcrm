import { db } from "db";
import { contacts, contracts, tasks, auditLog } from "db";
import { eq, and } from "drizzle-orm";
import type { ContractReviewRow } from "./review-queue-repository";
import type { ApplyResultPayload } from "./review-queue-repository";

export type ApplyContractReviewInput = {
  reviewId: string;
  tenantId: string;
  userId: string;
  row: ContractReviewRow;
};

export type ApplyContractReviewResult =
  | { ok: true; payload: ApplyResultPayload }
  | { ok: false; error: string };

/** Idempotent: find existing contact by email or personalId. */
async function findExistingContactId(
  tenantId: string,
  payload: Record<string, unknown>,
  tx: typeof db
): Promise<string | null> {
  const email = (payload.email as string)?.trim();
  const personalId = (payload.personalId as string)?.trim();
  if (email) {
    const byEmail = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)))
      .limit(1);
    if (byEmail[0]?.id) return byEmail[0].id;
  }
  if (personalId) {
    const byPersonalId = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.personalId, personalId)))
      .limit(1);
    if (byPersonalId[0]?.id) return byPersonalId[0].id;
  }
  return null;
}

/** Check duplicate contract: same tenant, contact, contractNumber, partnerName. */
async function findExistingContractId(
  tenantId: string,
  contactId: string,
  contractNumber: string | null,
  institutionName: string | null,
  tx: typeof db
): Promise<string | null> {
  const cn = contractNumber?.trim();
  const inst = institutionName?.trim();
  if (!cn && !inst) return null;
  const conditions = [
    eq(contracts.tenantId, tenantId),
    eq(contracts.contactId, contactId),
  ];
  if (cn) conditions.push(eq(contracts.contractNumber, cn));
  if (inst) conditions.push(eq(contracts.partnerName, inst));
  const rows = await tx
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(...conditions))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function applyContractReview(
  input: ApplyContractReviewInput
): Promise<ApplyContractReviewResult> {
  const { reviewId, tenantId, userId, row } = input;

  if (row.reviewStatus === "applied" && row.applyResultPayload) {
    return { ok: true, payload: row.applyResultPayload };
  }

  const draftActions = row.draftActions as Array<{
    type: string;
    label: string;
    payload: Record<string, unknown>;
  }> | null;
  if (!Array.isArray(draftActions) || draftActions.length === 0) {
    return { ok: false, error: "Žádné návrhové akce k aplikaci." };
  }

  const resolvedClientId = row.matchedClientId ?? null;
  const createNewConfirmed = row.createNewClientConfirmed === "true";
  let effectiveContactId: string | null = resolvedClientId;

  if (!effectiveContactId && !createNewConfirmed) {
    return {
      ok: false,
      error: "Vyberte klienta z kandidátů nebo potvrďte vytvoření nového klienta.",
    };
  }

  const resultPayload: ApplyResultPayload = {};

  try {
    await db.transaction(async (tx) => {
      if (!effectiveContactId && createNewConfirmed) {
        const createClientAction = draftActions.find((a) => a.type === "create_client");
        if (createClientAction) {
          const existing = await findExistingContactId(tenantId, createClientAction.payload, tx as unknown as typeof db);
          if (existing) {
            effectiveContactId = existing;
            resultPayload.linkedClientId = existing;
          } else {
            const firstName =
              String(createClientAction.payload.firstName ?? "").trim() || "Klient";
            const lastName =
              String(createClientAction.payload.lastName ?? "").trim() || "ze smlouvy";
            const [inserted] = await tx
              .insert(contacts)
              .values({
                tenantId,
                firstName,
                lastName,
                email: (createClientAction.payload.email as string)?.trim() || null,
                phone: (createClientAction.payload.phone as string)?.trim() || null,
                birthDate: (createClientAction.payload.birthDate as string) || null,
                personalId: (createClientAction.payload.personalId as string)?.trim() || null,
                street: (createClientAction.payload.address as string)?.trim() || null,
              })
              .returning({ id: contacts.id });
            if (inserted?.id) {
              effectiveContactId = inserted.id;
              resultPayload.createdClientId = inserted.id;
            }
          }
        }
        if (!effectiveContactId) {
          throw new Error("Nepodařilo se vytvořit ani najít klienta.");
        }
      } else if (effectiveContactId) {
        resultPayload.linkedClientId = effectiveContactId;
      }

      for (const action of draftActions) {
        if (action.type === "create_contract" && effectiveContactId) {
          const contractNumber = (action.payload.contractNumber as string)?.trim() || null;
          const institutionName = (action.payload.institutionName as string)?.trim() || null;
          const existingContractId = await findExistingContractId(
            tenantId,
            effectiveContactId,
            contractNumber,
            institutionName,
            tx as unknown as typeof db
          );
          if (existingContractId) {
            resultPayload.createdContractId = existingContractId;
            continue;
          }
          const [inserted] = await tx
            .insert(contracts)
            .values({
              tenantId,
              contactId: effectiveContactId,
              advisorId: userId,
              segment: "ZP",
              partnerName: institutionName,
              productName: (action.payload.productName as string)?.trim() || null,
              contractNumber,
              startDate: (action.payload.effectiveDate as string) || null,
              note: (action.payload.documentType as string)?.trim() || null,
            })
            .returning({ id: contracts.id });
          if (inserted?.id) resultPayload.createdContractId = inserted.id;
        } else if (action.type === "create_task" && effectiveContactId) {
          const title = (action.payload.title as string)?.trim() || action.label;
          const [inserted] = await tx
            .insert(tasks)
            .values({
              tenantId,
              contactId: effectiveContactId,
              title,
              description: (action.payload.notes as string) || null,
              assignedTo: userId,
              createdBy: userId,
            })
            .returning({ id: tasks.id });
          if (inserted?.id) resultPayload.createdTaskId = inserted.id;
        } else if (action.type === "create_payment") {
          // TODO: payments/invoices table when available
        } else if (action.type === "draft_email") {
          // No DB write
        }
      }
    });

    await db.insert(auditLog).values({
      tenantId,
      userId,
      action: "apply_contract_review",
      entityType: "contract_review",
      entityId: reviewId,
      meta: {
        reviewId,
        createdClientId: resultPayload.createdClientId ?? undefined,
        linkedClientId: resultPayload.linkedClientId ?? undefined,
        createdContractId: resultPayload.createdContractId ?? undefined,
        createdTaskId: resultPayload.createdTaskId ?? undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aplikace do CRM selhala.";
    return { ok: false, error: message };
  }

  return { ok: true, payload: resultPayload };
}
