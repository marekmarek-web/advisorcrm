import { db } from "db";
import { contacts, contracts, tasks, auditLog, clientPaymentSetups, type ClientPaymentSetupPaymentType } from "db";
import { eq, and, isNotNull } from "db";
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
        if ((action.type === "create_contract" || action.type === "create_or_update_contract_record") && effectiveContactId) {
          const contractNumber = (action.payload.contractNumber as string)?.trim() || null;
          const institutionName = (action.payload.institutionName as string)?.trim() || null;
          const segment = (action.payload.segment as string)?.trim() || "ZP";
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
          const premiumAmountRaw = (action.payload.premiumAmount as string | undefined)?.trim() || null;
          const premiumAnnualRaw = (action.payload.premiumAnnual as string | undefined)?.trim() || null;
          const productName = (action.payload.productName as string)?.trim() || null;
          const docType = (action.payload.documentType as string)?.trim() || null;
          const noteParts = [productName, docType].filter(Boolean);
          const [inserted] = await tx
            .insert(contracts)
            .values({
              tenantId,
              contactId: effectiveContactId,
              advisorId: userId,
              segment,
              partnerName: institutionName,
              productName,
              contractNumber,
              startDate: (action.payload.effectiveDate as string)?.trim() || null,
              premiumAmount: premiumAmountRaw,
              premiumAnnual: premiumAnnualRaw,
              note: noteParts.length ? noteParts.join(" · ") : null,
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
        } else if (action.type === "create_payment_setup" || action.type === "create_payment") {
          if (effectiveContactId) {
            const existingPay = await tx
              .select({ id: clientPaymentSetups.id })
              .from(clientPaymentSetups)
              .where(
                and(
                  eq(clientPaymentSetups.tenantId, tenantId),
                  eq(clientPaymentSetups.contactId, effectiveContactId),
                  eq(clientPaymentSetups.sourceContractReviewId, reviewId),
                  isNotNull(clientPaymentSetups.sourceContractReviewId)
                )
              )
              .limit(1);
            if (existingPay[0]?.id) {
              resultPayload.createdPaymentSetupId = existingPay[0].id;
              resultPayload.paymentSetup = {
                obligationName: (action.payload.obligationName as string) || "Platba",
                paymentType: (action.payload.paymentType as string) || "regular",
                provider: (action.payload.provider as string) || "",
                contractReference: (action.payload.contractReference as string) || "",
                recipientAccount: (action.payload.recipientAccount as string) || (action.payload.accountNumber as string) || "",
                iban: (action.payload.iban as string) || "",
                bankCode: (action.payload.bankCode as string) || "",
                variableSymbol: (action.payload.variableSymbol as string) || "",
                specificSymbol: (action.payload.specificSymbol as string) || "",
                regularAmount: (action.payload.regularAmount as string) || (action.payload.amount as string) || "",
                oneOffAmount: (action.payload.oneOffAmount as string) || "",
                currency: (action.payload.currency as string) || "CZK",
                frequency: (action.payload.frequency as string) || "",
                firstDueDate: (action.payload.firstDueDate as string) || (action.payload.firstPaymentDate as string) || "",
                clientNote: (action.payload.clientNote as string) || "",
              };
              continue;
            }
          }
          resultPayload.paymentSetup = {
            obligationName: (action.payload.obligationName as string) || "Platba",
            paymentType: (action.payload.paymentType as string) || "regular",
            provider: (action.payload.provider as string) || "",
            contractReference: (action.payload.contractReference as string) || "",
            recipientAccount: (action.payload.recipientAccount as string) || (action.payload.accountNumber as string) || "",
            iban: (action.payload.iban as string) || "",
            bankCode: (action.payload.bankCode as string) || "",
            variableSymbol: (action.payload.variableSymbol as string) || "",
            specificSymbol: (action.payload.specificSymbol as string) || "",
            regularAmount: (action.payload.regularAmount as string) || (action.payload.amount as string) || "",
            oneOffAmount: (action.payload.oneOffAmount as string) || "",
            currency: (action.payload.currency as string) || "CZK",
            frequency: (action.payload.frequency as string) || "",
            firstDueDate: (action.payload.firstDueDate as string) || (action.payload.firstPaymentDate as string) || "",
            clientNote: (action.payload.clientNote as string) || "",
          };
          if (effectiveContactId) {
            const rawType = String(action.payload.paymentType ?? action.payload.obligationType ?? "other")
              .toLowerCase()
              .trim();
            let domainType: ClientPaymentSetupPaymentType = "other";
            if (rawType.includes("insurance") || rawType.includes("poji")) domainType = "insurance";
            else if (rawType.includes("invest") || rawType.includes("fond")) domainType = "investment";
            else if (rawType.includes("loan") || rawType.includes("úvěr") || rawType.includes("uver"))
              domainType = "loan";

            const amountStr =
              (action.payload.regularAmount as string) ||
              (action.payload.amount as string) ||
              (action.payload.oneOffAmount as string) ||
              "";
            const parsedAmount = parseFloat(String(amountStr).replace(/\s/g, "").replace(",", "."));
            const amount =
              !Number.isNaN(parsedAmount) && parsedAmount >= 0 ? String(parsedAmount) : null;

            const [insertedPs] = await tx
              .insert(clientPaymentSetups)
              .values({
                tenantId,
                contactId: effectiveContactId,
                sourceContractReviewId: reviewId,
                status: "draft",
                paymentType: domainType,
                providerName: (action.payload.provider as string)?.trim() || null,
                productName: (action.payload.productName as string)?.trim() || null,
                contractNumber:
                  (action.payload.contractReference as string)?.trim() ||
                  (action.payload.contractNumber as string)?.trim() ||
                  null,
                beneficiaryName: (action.payload.beneficiaryName as string)?.trim() || null,
                accountNumber:
                  (action.payload.recipientAccount as string)?.trim() ||
                  (action.payload.accountNumber as string)?.trim() ||
                  null,
                bankCode: (action.payload.bankCode as string)?.trim() || null,
                iban: (action.payload.iban as string)?.trim() || null,
                bic: (action.payload.bic as string)?.trim() || null,
                variableSymbol: (action.payload.variableSymbol as string)?.trim() || null,
                specificSymbol: (action.payload.specificSymbol as string)?.trim() || null,
                constantSymbol: (action.payload.constantSymbol as string)?.trim() || null,
                amount: amount,
                currency: (action.payload.currency as string)?.trim() || "CZK",
                frequency: (action.payload.frequency as string)?.trim() || null,
                firstPaymentDate:
                  (action.payload.firstDueDate as string)?.trim() ||
                  (action.payload.firstPaymentDate as string)?.trim() ||
                  null,
                paymentInstructionsText: (action.payload.clientNote as string)?.trim() || null,
                needsHumanReview: true,
              })
              .returning({ id: clientPaymentSetups.id });
            if (insertedPs?.id) resultPayload.createdPaymentSetupId = insertedPs.id;
          }
        } else if (action.type === "draft_email" || action.type === "create_notification") {
          // No DB write - these are UI-only suggestions
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
        createdPaymentSetupId: resultPayload.createdPaymentSetupId ?? undefined,
        createdTaskId: resultPayload.createdTaskId ?? undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aplikace do CRM selhala.";
    return { ok: false, error: message };
  }

  return { ok: true, payload: resultPayload };
}
