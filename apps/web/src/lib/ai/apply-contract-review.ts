import { db } from "db";
import { contacts, contracts, tasks, auditLog, clientPaymentSetups, contractSegments, type ClientPaymentSetupPaymentType } from "db";
import { eq, and, isNotNull } from "db";
import type { ContractReviewRow } from "./review-queue-repository";
import type { ApplyResultPayload } from "./review-queue-repository";
import {
  buildPortfolioAttributesFromExtracted,
  mergePortfolioAttributesForApply,
} from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import { normalizeDateToISO } from "./canonical-date-normalize";
import {
  buildCanonicalPaymentPayloadFromRaw,
  isPaymentSyncReady,
  type CanonicalPaymentPayload,
} from "./payment-field-contract";
import { capturePublishGuardFailure } from "@/lib/observability/portal-sentry";

const VALID_SEGMENTS = new Set<string>(contractSegments);

function validateSegment(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return VALID_SEGMENTS.has(trimmed) ? trimmed : "ZP";
}

export type ApplyContractReviewInput = {
  reviewId: string;
  tenantId: string;
  userId: string;
  row: ContractReviewRow;
};

export type ApplyContractReviewResult =
  | { ok: true; payload: ApplyResultPayload }
  | { ok: false; error: string };

function normalizeExtractionConfidence(c: number | null | undefined): string | null {
  if (c == null || !Number.isFinite(c)) return null;
  const v = c > 1 ? c / 100 : c;
  const clamped = Math.min(1, Math.max(0, v));
  return String(clamped);
}

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
  const attrsFromReview = buildPortfolioAttributesFromExtracted(row.extractedPayload);
  const extractionConfidence = normalizeExtractionConfidence(row.confidence ?? undefined);

  if (row.reviewStatus === "applied" && row.applyResultPayload) {
    return { ok: true, payload: row.applyResultPayload };
  }

  if (row.reviewStatus !== "approved") {
    capturePublishGuardFailure({
      tenantId,
      reviewId,
      reason: `applyContractReview: reviewStatus="${row.reviewStatus}" is not approved`,
    });
    return { ok: false, error: "Publish guard: review musí být schválena před aplikací do CRM." };
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
        const createClientAction = draftActions.find(
          (a) => a.type === "create_client" || a.type === "create_new_client"
        );
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
                birthDate: normalizeDateToISO(createClientAction.payload.birthDate as string) || null,
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
        if (
          (action.type === "create_contract" ||
            action.type === "create_or_update_contract_record" ||
            action.type === "create_or_update_contract_production") &&
          effectiveContactId
        ) {
          const contractNumber = (action.payload.contractNumber as string)?.trim() || null;
          const institutionName = (action.payload.institutionName as string)?.trim() || null;
          const segment = validateSegment(action.payload.segment as string);
          const existingContractId = await findExistingContractId(
            tenantId,
            effectiveContactId,
            contractNumber,
            institutionName,
            tx as unknown as typeof db
          );
          if (existingContractId) {
            const [existingRow] = await tx
              .select({
                portfolioAttributes: contracts.portfolioAttributes,
                sourceKind: contracts.sourceKind,
              })
              .from(contracts)
              .where(eq(contracts.id, existingContractId))
              .limit(1);
            const prevAttrs =
              (existingRow?.portfolioAttributes as Record<string, unknown> | undefined) ?? {};
            const preserveManualLineage = existingRow?.sourceKind === "manual";
            await tx
              .update(contracts)
              .set({
                sourceContractReviewId: reviewId,
                ...(preserveManualLineage ? {} : { sourceKind: "ai_review" as const }),
                segment,
                type: segment,
                advisorConfirmedAt: new Date(),
                confirmedByUserId: userId,
                visibleToClient: true,
                portfolioStatus: "active",
                portfolioAttributes: mergePortfolioAttributesForApply(prevAttrs, attrsFromReview),
                extractionConfidence,
                updatedAt: new Date(),
              })
              .where(eq(contracts.id, existingContractId));
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
              type: segment,
              partnerName: institutionName,
              productName,
              contractNumber,
              startDate: normalizeDateToISO((action.payload.effectiveDate as string)?.trim()) || null,
              premiumAmount: premiumAmountRaw,
              premiumAnnual: premiumAnnualRaw,
              note: noteParts.length ? noteParts.join(" · ") : null,
              visibleToClient: true,
              portfolioStatus: "active",
              sourceKind: "ai_review",
              sourceContractReviewId: reviewId,
              advisorConfirmedAt: new Date(),
              confirmedByUserId: userId,
              portfolioAttributes: attrsFromReview,
              extractionConfidence,
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
        } else if (
          action.type === "create_payment_setup" ||
          action.type === "create_payment" ||
          action.type === "create_payment_setup_for_portal"
        ) {
          const paymentSetupResult = await applyPaymentSetupAction(tx as unknown as typeof db, {
            tenantId,
            reviewId,
            effectiveContactId,
            action,
            row,
            createdContractId: resultPayload.createdContractId ?? null,
          });
          if (paymentSetupResult.paymentSetup) {
            resultPayload.paymentSetup = paymentSetupResult.paymentSetup;
          }
          if (paymentSetupResult.createdPaymentSetupId) {
            resultPayload.createdPaymentSetupId = paymentSetupResult.createdPaymentSetupId;
          }
        } else if (
          action.type === "draft_email" ||
          action.type === "create_followup_email_draft" ||
          action.type === "create_notification"
        ) {
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

function buildPaymentSetupPreview(
  p: Record<string, unknown>
): ApplyResultPayload["paymentSetup"] {
  return {
    obligationName: (p.obligationName as string) || "Platba",
    paymentType: (p.paymentType as string) || "regular",
    provider: (p.provider as string) || "",
    contractReference: (p.contractReference as string) || "",
    recipientAccount: (p.recipientAccount as string) || (p.accountNumber as string) || "",
    iban: (p.iban as string) || "",
    bankCode: (p.bankCode as string) || "",
    variableSymbol: (p.variableSymbol as string) || "",
    specificSymbol: (p.specificSymbol as string) || "",
    regularAmount: (p.regularAmount as string) || (p.amount as string) || "",
    oneOffAmount: (p.oneOffAmount as string) || "",
    currency: (p.currency as string) || "CZK",
    frequency: (p.frequency as string) || "",
    firstDueDate: (p.firstDueDate as string) || (p.firstPaymentDate as string) || "",
    clientNote: (p.clientNote as string) || "",
  };
}

function resolvePaymentDomainType(
  action: { payload: Record<string, unknown> }
): ClientPaymentSetupPaymentType {
  const rawType = String(action.payload.paymentType ?? action.payload.obligationType ?? "other")
    .toLowerCase()
    .trim();
  if (rawType.includes("insurance") || rawType.includes("poji")) return "insurance";
  if (rawType.includes("invest") || rawType.includes("fond")) return "investment";
  if (rawType.includes("loan") || rawType.includes("úvěr") || rawType.includes("uver")) return "loan";
  return "other";
}

function parsePaymentAmount(payload: Record<string, unknown>): string | null {
  const amountStr =
    (payload.regularAmount as string) ||
    (payload.amount as string) ||
    (payload.oneOffAmount as string) ||
    "";
  const parsedAmount = parseFloat(String(amountStr).replace(/\s/g, "").replace(",", "."));
  return !Number.isNaN(parsedAmount) && parsedAmount >= 0 ? String(parsedAmount) : null;
}

function buildPaymentSetupDbValues(
  tenantId: string,
  contactId: string,
  reviewId: string,
  action: { payload: Record<string, unknown> },
  isApproved: boolean,
) {
  const domainType = resolvePaymentDomainType(action);
  const amount = parsePaymentAmount(action.payload);
  return {
    tenantId,
    contactId,
    sourceContractReviewId: reviewId,
    status: isApproved ? ("active" as const) : ("draft" as const),
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
    amount,
    currency: (action.payload.currency as string)?.trim() || "CZK",
    frequency: (action.payload.frequency as string)?.trim() || null,
    firstPaymentDate:
      normalizeDateToISO((action.payload.firstDueDate as string)?.trim()) ||
      normalizeDateToISO((action.payload.firstPaymentDate as string)?.trim()) ||
      null,
    paymentInstructionsText: (action.payload.clientNote as string)?.trim() || null,
    needsHumanReview: !isApproved,
    updatedAt: new Date(),
  };
}

/**
 * Phase 3C: Hardened payment setup apply with idempotent upsert,
 * post-approval status, and modelation guard.
 */
async function applyPaymentSetupAction(
  tx: typeof db,
  params: {
    tenantId: string;
    reviewId: string;
    effectiveContactId: string | null;
    action: { type: string; payload: Record<string, unknown> };
    row: ContractReviewRow;
    createdContractId: string | null;
  },
): Promise<{
  paymentSetup?: ApplyResultPayload["paymentSetup"];
  createdPaymentSetupId?: string;
}> {
  const { tenantId, reviewId, effectiveContactId, action, row } = params;
  const preview = buildPaymentSetupPreview(action.payload);

  if (!effectiveContactId) {
    return { paymentSetup: preview };
  }

  const lifecycle = row.lifecycleStatus ??
    ((row.extractedPayload as Record<string, unknown> | null)?.documentClassification as Record<string, unknown> | undefined)?.lifecycleStatus as string | undefined;
  const isNonFinal =
    lifecycle === "modelation" || lifecycle === "illustration";
  if (isNonFinal) {
    return { paymentSetup: preview };
  }

  const canonical = buildCanonicalPaymentPayloadFromRaw(
    row.extractedPayload as Record<string, unknown> ?? {}
  );
  if (canonical && !isPaymentSyncReady(canonical)) {
    return { paymentSetup: preview };
  }

  const isApproved = row.reviewStatus === "approved";
  const dbValues = buildPaymentSetupDbValues(tenantId, effectiveContactId, reviewId, action, isApproved);

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
    const { tenantId: _, contactId: __, sourceContractReviewId: ___, ...updateValues } = dbValues;
    await tx
      .update(clientPaymentSetups)
      .set(updateValues)
      .where(eq(clientPaymentSetups.id, existingPay[0].id));
    return {
      paymentSetup: preview,
      createdPaymentSetupId: existingPay[0].id,
    };
  }

  const [insertedPs] = await tx
    .insert(clientPaymentSetups)
    .values(dbValues)
    .returning({ id: clientPaymentSetups.id });

  return {
    paymentSetup: preview,
    createdPaymentSetupId: insertedPs?.id,
  };
}
