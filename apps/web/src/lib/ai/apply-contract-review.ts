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
import {
  enforceContactPayload,
  enforceContractPayload,
  enforcePaymentPayload,
  isSupportingDocumentOnly,
  buildApplyEnforcementTrace,
  type ApplyPolicyEnforcementTrace,
} from "@/lib/ai/apply-policy-enforcement";

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

  // Sensitivity / publishability signals are logged for audit but NEVER block apply.
  // The advisor has already reviewed and approved — these are section-level warnings.
  const extractedPayloadForGate = row.extractedPayload as Record<string, unknown> | null | undefined;
  const publishHintsForGate = extractedPayloadForGate?.publishHints as Record<string, unknown> | null | undefined;
  if (publishHintsForGate?.sensitiveAttachmentOnly === true || publishHintsForGate?.contractPublishable === false) {
    capturePublishGuardFailure({
      tenantId,
      reviewId,
      reason: `publishHints warning (non-blocking): sensitiveAttachmentOnly=${publishHintsForGate.sensitiveAttachmentOnly}, contractPublishable=${publishHintsForGate.contractPublishable}`,
    });
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

  // Fáze 9: Resolve extractedPayload pro enforcement engine
  const extractedPayloadForEnforcement = (row.extractedPayload as Record<string, unknown>) ?? {};

  // Supporting document guard — payslip, daňové přiznání, výpis z účtu nesmí generovat contract apply
  const isSupporting = isSupportingDocumentOnly(extractedPayloadForEnforcement);

  // Kolektory pro enforcement trace
  let contactEnforcementResult: ReturnType<typeof enforceContactPayload> | undefined;
  let contractEnforcementResult: ReturnType<typeof enforceContractPayload> | undefined;
  let paymentEnforcementResult: ReturnType<typeof enforcePaymentPayload> | undefined;

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
            // Fáze 9: Enforce contact payload před DB write
            const contactEnforce = enforceContactPayload(
              createClientAction.payload,
              extractedPayloadForEnforcement,
            );
            contactEnforcementResult = contactEnforce;
            const ep = contactEnforce.enforcedPayload;

            // firstName/lastName jsou povinné pro vytvoření kontaktu — fallback i při manual_required
            const firstName =
              String(ep.firstName ?? createClientAction.payload.firstName ?? "").trim() || "Klient";
            const lastName =
              String(ep.lastName ?? createClientAction.payload.lastName ?? "").trim() || "ze smlouvy";
            const [inserted] = await tx
              .insert(contacts)
              .values({
                tenantId,
                firstName,
                lastName,
                // Pole s prefill_confirm jdou jako null (needsHumanReview) — nebo jako hodnota pokud prošla enforcement
                email: (ep.email as string)?.trim() || null,
                phone: (ep.phone as string)?.trim() || null,
                birthDate: normalizeDateToISO(ep.birthDate as string) || null,
                personalId: (ep.personalId as string)?.trim() || null,
                street: (ep.address as string)?.trim() || null,
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
          // Fáze 9: Supporting document guard — blocking contract apply for payslip/tax/bank statement
          if (isSupporting) {
            // Supporting doc nesmí vytvořit contract-like DB apply — přeskočíme
            continue;
          }

          // Fáze 9: Enforce contract payload před DB write
          const contractEnforce = enforceContractPayload(
            action.payload,
            extractedPayloadForEnforcement,
          );
          contractEnforcementResult = contractEnforce;
          const ep = contractEnforce.enforcedPayload;

          // contractNumber: manual_required → null (nesmí se tvářit jako potvrzené)
          const contractNumber = (ep.contractNumber as string)?.trim() || null;
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
          // premiumAmount: manual_required nebo do_not_apply → null (nesmí se zapsat jako finální)
          const premiumAmountRaw = (ep.premiumAmount as string | undefined)?.trim() || null;
          const premiumAnnualRaw = (ep.premiumAnnual as string | undefined)?.trim() || null;
          const productName = (ep.productName as string)?.trim() || null;
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
              startDate: normalizeDateToISO((ep.effectiveDate as string)?.trim()) || null,
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
          // Fáze 9: Supporting document guard — payslip/daňové přiznání nesmí vytvořit payment setup
          if (isSupporting) {
            continue;
          }

          // Fáze 9: Enforce payment payload před DB write
          const paymentEnforce = enforcePaymentPayload(
            action.payload,
            extractedPayloadForEnforcement,
          );
          paymentEnforcementResult = paymentEnforce;

          // Pokud jsou všechna citlivá platební pole excluded/manual_required, přeskočíme payment create
          const hasUsablePaymentData =
            paymentEnforce.autoAppliedFields.length > 0 ||
            paymentEnforce.pendingConfirmationFields.length > 0;

          if (!hasUsablePaymentData) {
            // Žádná použitelná platební data — payment setup se nevytvoří
            continue;
          }

          // Akce pro applyPaymentSetupAction s enforcovaným payloadem
          const enforcedPaymentAction = {
            ...action,
            payload: paymentEnforce.enforcedPayload,
          };

          const paymentSetupResult = await applyPaymentSetupAction(tx as unknown as typeof db, {
            tenantId,
            reviewId,
            effectiveContactId,
            action: enforcedPaymentAction,
            row,
            createdContractId: resultPayload.createdContractId ?? null,
            // Fáze 9: prefill_confirm pole → needsHumanReview=true v DB
            hasPrefillConfirmFields: paymentEnforce.pendingConfirmationFields.length > 0,
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

    // Fáze 9: Build enforcement trace pro audit a resultPayload
    const enforcementTrace = buildApplyEnforcementTrace(
      contactEnforcementResult,
      contractEnforcementResult,
      paymentEnforcementResult,
      extractedPayloadForEnforcement,
    );

    // Přidej trace do resultPayload (viditelný v applyResultPayload v DB)
    resultPayload.policyEnforcementTrace = {
      supportingDocumentGuard: enforcementTrace.supportingDocumentGuard,
      outputMode: enforcementTrace.outputMode,
      summary: enforcementTrace.summary,
      contactEnforcement: contactEnforcementResult
        ? {
            autoAppliedFields: contactEnforcementResult.autoAppliedFields,
            pendingConfirmationFields: contactEnforcementResult.pendingConfirmationFields,
            manualRequiredFields: contactEnforcementResult.manualRequiredFields,
            excludedFields: contactEnforcementResult.excludedFields,
          }
        : undefined,
      contractEnforcement: contractEnforcementResult
        ? {
            autoAppliedFields: contractEnforcementResult.autoAppliedFields,
            pendingConfirmationFields: contractEnforcementResult.pendingConfirmationFields,
            manualRequiredFields: contractEnforcementResult.manualRequiredFields,
            excludedFields: contractEnforcementResult.excludedFields,
          }
        : undefined,
      paymentEnforcement: paymentEnforcementResult
        ? {
            autoAppliedFields: paymentEnforcementResult.autoAppliedFields,
            pendingConfirmationFields: paymentEnforcementResult.pendingConfirmationFields,
            manualRequiredFields: paymentEnforcementResult.manualRequiredFields,
            excludedFields: paymentEnforcementResult.excludedFields,
          }
        : undefined,
    };

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
        // Fáze 9: enforcement summary v audit logu
        policyEnforcementSummary: enforcementTrace.summary,
        supportingDocumentGuard: enforcementTrace.supportingDocumentGuard,
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
  /** Fáze 9: true pokud platební pole mají prefill_confirm policy (needsHumanReview override) */
  hasPrefillConfirmFields?: boolean,
) {
  const domainType = resolvePaymentDomainType(action);
  const amount = parsePaymentAmount(action.payload);
  // Fáze 9: needsHumanReview=true pokud review není schválena NEBO má prefill_confirm pole
  const needsHumanReview = !isApproved || (hasPrefillConfirmFields === true);
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
    needsHumanReview,
    updatedAt: new Date(),
  };
}

/**
 * Phase 3C + Fáze 9: Hardened payment setup apply with idempotent upsert,
 * post-approval status, modelation guard, and apply policy enforcement.
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
    /** Fáze 9: true pokud platební pole mají prefill_confirm policy */
    hasPrefillConfirmFields?: boolean;
  },
): Promise<{
  paymentSetup?: ApplyResultPayload["paymentSetup"];
  createdPaymentSetupId?: string;
}> {
  const { tenantId, reviewId, effectiveContactId, action, row, hasPrefillConfirmFields } = params;
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
  // Fáze 9: předej prefill_confirm flag pro needsHumanReview override
  const dbValues = buildPaymentSetupDbValues(tenantId, effectiveContactId, reviewId, action, isApproved, hasPrefillConfirmFields);

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
