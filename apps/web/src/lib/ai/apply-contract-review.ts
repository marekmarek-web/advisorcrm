import { db } from "db";
import {
  contacts,
  contracts,
  partners,
  products,
  auditLog,
  clientPaymentSetups,
  contractSegments,
  type ClientPaymentSetupPaymentType,
} from "db";
import { eq, and, or, isNull, isNotNull, ilike } from "db";
import * as Sentry from "@sentry/nextjs";
import type { ContractReviewRow } from "./review-queue-repository";
import type { ApplyResultPayload } from "./review-queue-repository";
import {
  buildPortfolioAttributesFromExtracted,
} from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import {
  mergeIdentityPortfolioFieldsFromExtracted,
  mergePortfolioAttributesWithPhase1Scalars,
} from "./portfolio-phase1-attributes";
import { normalizeDateToISO } from "./canonical-date-normalize";
import {
  buildCanonicalPaymentPayloadFromRaw,
  dedupeCzechAccountTrailingBankCode,
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
import { validateBeforeApply } from "./pre-apply-validation";
import type { DocumentReviewEnvelope, PrimaryDocumentType } from "./document-review-types";
import { getDocumentTypeLabel } from "./document-messages";
import { applyExtractedFieldAliasNormalizations } from "./extraction-field-alias-normalize";
import {
  resolveFieldMerge,
  type ContactSourceKind,
} from "./field-merge-policy";
import { loadContactPortalAccessSnapshot } from "./client-portal-access";
import { computeAccessVerdict } from "@/lib/auth/access-verdict";
import { resolveFundFromPortfolioAttributes } from "@/lib/fund-library/fund-resolution";
import { resolveApplyClientContactId } from "@/lib/ai/apply-client-resolution";
import { buildContactMergePayloadFromExtractedEnvelope } from "@/lib/ai/draft-actions";
import {
  ensureUserProfileRowForAdvisor,
  formatContractAdvisorFkApplyError,
} from "@/lib/db/ensure-user-profile-for-contract-fk";

const VALID_SEGMENTS = new Set<string>(contractSegments);

/** INV/DIP/DPS — same business contract ref must dedupe across product vs payment-instruction applies. */
const INVESTMENT_CONTRACT_SEGMENTS = new Set<string>(["INV", "DIP", "DPS"]);

function readCellFromExtractedFields(
  ef: Record<string, unknown> | undefined,
  keys: string[]
): string | null {
  if (!ef) return null;
  for (const key of keys) {
    const cell = ef[key];
    if (!cell || typeof cell !== "object") continue;
    const v = (cell as { value?: unknown }).value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Resolves contract reference when enforcement nulls contractNumber but the ref exists
 * on the raw draft action, envelope root, or extractedFields cells (investment family).
 */
export function resolveContractReferenceForApply(
  enforcedPayload: Record<string, unknown>,
  rawActionPayload: Record<string, unknown>,
  extractedPayload: Record<string, unknown>,
): string | null {
  const candidates = [
    enforcedPayload.contractNumber,
    enforcedPayload.contractReference,
    rawActionPayload.contractNumber,
    rawActionPayload.contractReference,
    extractedPayload.contractNumber,
    extractedPayload.contractReference,
    extractedPayload.proposalNumber,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const ef = extractedPayload.extractedFields as Record<string, unknown> | undefined;
  return readCellFromExtractedFields(ef, [
    "contractNumber",
    "contractReference",
    "proposalNumber",
    "proposalNumber_or_contractNumber",
  ]);
}

function inferInvestmentSegmentFromEnvelope(extractedPayload: Record<string, unknown>): string | null {
  const dc = extractedPayload.documentClassification as Record<string, unknown> | undefined;
  const primary = typeof dc?.primaryType === "string" ? dc.primaryType : "";
  const family = typeof dc?.productFamily === "string" ? dc.productFamily : "";
  if (family.toLowerCase() === "investment") return "INV";
  if (primary.includes("life_insurance")) return null;
  if (primary.includes("investment")) return "INV";
  const seg = typeof extractedPayload.segment === "string" ? extractedPayload.segment.trim() : "";
  if (INVESTMENT_CONTRACT_SEGMENTS.has(seg)) return seg;
  return null;
}

/**
 * Avoids defaulting missing segment to ZP for investment document families (payment instructions
 * often omit segment while product-bearing docs use INV/DIP/DPS).
 */
export function resolveSegmentForContractApply(
  actionPayload: Record<string, unknown>,
  extractedPayload: Record<string, unknown>,
): string {
  const raw = (actionPayload.segment as string)?.trim();
  if (raw && VALID_SEGMENTS.has(raw)) return raw;
  const inferred = inferInvestmentSegmentFromEnvelope(extractedPayload);
  if (inferred) return inferred;
  const envSeg = typeof extractedPayload.segment === "string" ? extractedPayload.segment.trim() : "";
  if (envSeg && VALID_SEGMENTS.has(envSeg)) return envSeg;
  return validateSegment(raw);
}

function investmentSegmentDedupeCompatible(
  lookupSeg: string | null | undefined,
  candidateSeg: string | null | undefined,
): boolean {
  const ls = normalizeComparableText(lookupSeg);
  const cs = normalizeComparableText(candidateSeg);
  if (!ls || !cs) return false;
  const inv = new Set(["inv", "dip", "dps"]);
  const lInv = inv.has(ls);
  const cInv = inv.has(cs);
  if (lInv && cInv) return true;
  // Payment-instruction drafts often default segment to ZP while the canonical row is investment.
  // Do not match the inverse (lookup=investment, candidate=ZP) — avoids collapsing unrelated rows.
  if (cInv && ls === "zp") return true;
  return false;
}

function firstFundNameFromAttrs(attrs: Record<string, unknown>): string | null {
  const funds = attrs.investmentFunds;
  if (!Array.isArray(funds) || funds.length === 0) return null;
  const first = funds[0] as { name?: string } | undefined;
  return hasNonEmptyText(first?.name) ? String(first!.name).trim() : null;
}

function isLikelyPaymentOnlyProductLabel(name: string | null | undefined): boolean {
  if (!hasNonEmptyText(name)) return false;
  const n = name!.toLowerCase();
  return (
    n.includes("platb") ||
    n.includes("payment") ||
    n.includes("instrukc") ||
    n.includes("variabilní") ||
    n.includes("variabilni") ||
    n.includes("sepa") ||
    n.includes("informativ")
  );
}

/** Prefers concrete fund / strategy over payment-instruction or generic marketing titles. */
export function pickStrongerInvestmentProductName(
  existing: string | null,
  incoming: string | null,
  attrs: Record<string, unknown>,
  segment: string,
): string | null {
  if (!INVESTMENT_CONTRACT_SEGMENTS.has(segment)) return preferExistingValue(existing, incoming);
  const fund = firstFundNameFromAttrs(attrs);
  const chosen = preferExistingValue(existing, incoming);
  if (fund && isLikelyPaymentOnlyProductLabel(chosen)) return fund;
  if (fund && isLikelyPaymentOnlyProductLabel(incoming) && !hasNonEmptyText(existing)) return fund;
  if (
    fund &&
    hasNonEmptyText(chosen) &&
    !isLikelyPaymentOnlyProductLabel(chosen) &&
    fund.length > chosen.length + 8 &&
    /\b(etf|ucits|fond|fund|msci|index|akci|dluhopis|bond|strategy|strategi)\b/i.test(fund)
  ) {
    return fund;
  }
  return chosen;
}

/**
 * Catalog FK resolution: find partnerId/productId by name (case-insensitive fuzzy match).
 * Soft-fail by design — returns nulls when catalog entry not found.
 * Generic: does not hardcode any vendor or institution name.
 */
async function resolveCatalogFKs(
  tenantId: string,
  partnerName: string | null,
  productName: string | null,
  segment: string,
  tx: typeof db
): Promise<{ partnerId: string | null; productId: string | null }> {
  if (!partnerName) return { partnerId: null, productId: null };

  const partnerRows = await tx
    .select({ id: partners.id, name: partners.name, tenantId: partners.tenantId })
    .from(partners)
    .where(
      and(
        ilike(partners.name, partnerName.trim()),
        eq(partners.segment, segment),
        or(eq(partners.tenantId, tenantId), isNull(partners.tenantId)),
      )
    )
    .limit(10);

  const tenantPartner = partnerRows.find((p) => p.tenantId === tenantId);
  const globalPartner = partnerRows.find((p) => !p.tenantId);
  const resolvedPartner = tenantPartner ?? globalPartner ?? null;

  if (!resolvedPartner) {
    console.warn("[apply] catalog partner lookup: no match", {
      partnerName: partnerName.slice(0, 80),
      segment,
    });
    return { partnerId: null, productId: null };
  }

  if (!productName) return { partnerId: resolvedPartner.id, productId: null };

  const productRows = await tx
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.partnerId, resolvedPartner.id),
        ilike(products.name, productName.trim())
      )
    )
    .limit(5);

  const resolvedProduct = productRows[0] ?? null;
  if (!resolvedProduct) {
    console.warn("[apply] catalog product lookup: partner found but product not matched", {
      partnerId: resolvedPartner.id,
      productName: productName.slice(0, 80),
    });
  }

  return {
    partnerId: resolvedPartner.id,
    productId: resolvedProduct?.id ?? null,
  };
}

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

type ExistingContactSnapshot = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  personalId: string | null;
  idCardNumber: string | null;
  idCardIssuedBy: string | null;
  idCardValidUntil: string | null;
  idCardIssuedAt: string | null;
  generalPractitioner: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};

type ExistingContractSnapshot = {
  id: string;
  contractNumber: string | null;
  partnerName: string | null;
  productName: string | null;
  startDate: string | null;
  segment: string | null;
  sourceContractReviewId: string | null;
};

type ExistingContractLookup = {
  contractNumber: string | null;
  institutionName: string | null;
  productName: string | null;
  effectiveDate: string | null;
  segment: string | null;
};

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeComparableText(value: string | null | undefined): string | null {
  if (!hasNonEmptyText(value)) return null;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContractIdentifier(value: string | null | undefined): string | null {
  if (!hasNonEmptyText(value)) return null;
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function preferExistingValue(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  if (hasNonEmptyText(existing)) return existing.trim();
  if (hasNonEmptyText(incoming)) return incoming.trim();
  return null;
}

function splitContactName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!hasNonEmptyText(fullName)) {
    return { firstName: null, lastName: null };
  }
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts.slice(1).join(" "),
    lastName: parts[0],
  };
}

export function buildContactUpdatePatch(
  existing: ExistingContactSnapshot,
  payload: Record<string, unknown>
): Record<string, string> {
  const patch: Record<string, string> = {};

  const assignIfChanged = (
    key: keyof Pick<
      ExistingContactSnapshot,
      "firstName" | "lastName" | "email" | "phone" | "personalId" | "street" | "city" | "zip"
    >,
    incoming: unknown
  ) => {
    if (!hasNonEmptyText(incoming)) return;
    const next = incoming.trim();
    if (normalizeComparableText(existing[key]) === normalizeComparableText(next)) return;
    patch[key] = next;
  };

  assignIfChanged("firstName", payload.firstName);
  assignIfChanged("lastName", payload.lastName);
  assignIfChanged("email", payload.email);
  assignIfChanged("phone", payload.phone);
  assignIfChanged("personalId", payload.personalId);
  assignIfChanged("city", payload.city);
  assignIfChanged("zip", payload.zip);

  const streetCandidate =
    hasNonEmptyText(payload.street) ? payload.street : hasNonEmptyText(payload.address) ? payload.address : null;
  assignIfChanged("street", streetCandidate);

  const birthDate = normalizeDateToISO(
    hasNonEmptyText(payload.birthDate) ? payload.birthDate : null
  );
  if (birthDate && normalizeDateToISO(existing.birthDate) !== birthDate) {
    patch.birthDate = birthDate;
  }

  return patch;
}

export function selectExistingContractId(
  candidates: ExistingContractSnapshot[],
  lookup: ExistingContractLookup & { sourceContractReviewId?: string | null }
): string | null {
  // Slice 3: Re-apply stejné review → sourceContractReviewId match je nejvyšší priorita.
  // Garantuje, že re-apply vždy updatuje ten samý contract, i když contractNumber chybí nebo se liší.
  if (lookup.sourceContractReviewId) {
    const byReview = candidates.find(
      (c) => c.sourceContractReviewId === lookup.sourceContractReviewId
    );
    if (byReview) return byReview.id;
  }

  const wantedContractNumber = normalizeContractIdentifier(lookup.contractNumber);
  const wantedPartner = normalizeComparableText(lookup.institutionName);
  const wantedProduct = normalizeComparableText(lookup.productName);
  const wantedStartDate = normalizeDateToISO(lookup.effectiveDate);
  const wantedSegment = normalizeComparableText(lookup.segment);

  const segmentMatches = (candidate: ExistingContractSnapshot) => {
    if (!wantedSegment) return true;
    const candidateSegment = normalizeComparableText(candidate.segment);
    return !candidateSegment || candidateSegment === wantedSegment;
  };

  if (wantedContractNumber) {
    const byContractNumber = candidates.find(
      (candidate) =>
        segmentMatches(candidate) &&
        normalizeContractIdentifier(candidate.contractNumber) === wantedContractNumber
    );
    if (byContractNumber) return byContractNumber.id;

    // Investment family: one doc may carry INV/DIP while a payment-instruction draft defaulted to ZP.
    // Same ref must still resolve to the single canonical investment contract row.
    const byContractNumberInvestmentFamily = candidates.find(
      (candidate) =>
        normalizeContractIdentifier(candidate.contractNumber) === wantedContractNumber &&
        investmentSegmentDedupeCompatible(lookup.segment, candidate.segment)
    );
    if (byContractNumberInvestmentFamily) return byContractNumberInvestmentFamily.id;
  }

  if (wantedPartner && wantedProduct) {
    const byPartnerAndProduct = candidates.find(
      (candidate) =>
        segmentMatches(candidate) &&
        normalizeComparableText(candidate.partnerName) === wantedPartner &&
        normalizeComparableText(candidate.productName) === wantedProduct
    );
    if (byPartnerAndProduct) return byPartnerAndProduct.id;
  }

  if (wantedPartner && wantedStartDate) {
    const byPartnerAndStartDate = candidates.find(
      (candidate) =>
        segmentMatches(candidate) &&
        normalizeComparableText(candidate.partnerName) === wantedPartner &&
        normalizeDateToISO(candidate.startDate) === wantedStartDate
    );
    if (byPartnerAndStartDate) return byPartnerAndStartDate.id;
  }

  if (wantedPartner) {
    const samePartnerOnly = candidates.filter(
      (candidate) =>
        segmentMatches(candidate) &&
        normalizeComparableText(candidate.partnerName) === wantedPartner
    );
    if (samePartnerOnly.length === 1) return samePartnerOnly[0].id;
  }

  return null;
}

/**
 * Slice 2: Contact fields that participate in merge policy loop.
 * Generic list — does not hardcode vendor-specific semantics.
 */
const CONTACT_MERGE_FIELDS: Array<{
  fieldKey: keyof Pick<
    ExistingContactSnapshot,
    "firstName" | "lastName" | "email" | "phone" | "personalId" | "idCardNumber" | "idCardIssuedBy" | "idCardValidUntil" | "idCardIssuedAt" | "generalPractitioner" | "street" | "city" | "zip" | "birthDate"
  >;
  payloadKeys: string[];
  normalize?: (v: string) => string | null;
}> = [
  { fieldKey: "firstName", payloadKeys: ["firstName"] },
  { fieldKey: "lastName", payloadKeys: ["lastName"] },
  { fieldKey: "email", payloadKeys: ["email"] },
  { fieldKey: "phone", payloadKeys: ["phone"] },
  { fieldKey: "personalId", payloadKeys: ["personalId"] },
  { fieldKey: "idCardNumber", payloadKeys: ["idCardNumber"] },
  { fieldKey: "idCardIssuedBy", payloadKeys: ["idCardIssuedBy", "issuingAuthority"] },
  { fieldKey: "idCardValidUntil", payloadKeys: ["idCardValidUntil", "expiryDate"] },
  { fieldKey: "idCardIssuedAt", payloadKeys: ["idCardIssuedAt", "issuedDate"] },
  { fieldKey: "generalPractitioner", payloadKeys: ["generalPractitioner"] },
  { fieldKey: "street", payloadKeys: ["street", "address"] },
  { fieldKey: "city", payloadKeys: ["city"] },
  { fieldKey: "zip", payloadKeys: ["zip"] },
  {
    fieldKey: "birthDate",
    payloadKeys: ["birthDate"],
    normalize: (v) => normalizeDateToISO(v),
  },
];

/**
 * Slice 2: Merge-policy-based contact update.
 * Uses resolveFieldMerge loop over CONTACT_MERGE_FIELDS.
 * - auto_fill: applies value
 * - keep_existing / manual_protected: no-op
 * - flag_pending: adds to pendingFields[], no DB write
 * Returns list of pending conflicts for propagation into applyResultPayload.
 */
async function updateExistingContactFromPayloadWithMerge(
  tenantId: string,
  contactId: string,
  payload: Record<string, unknown>,
  tx: typeof db
): Promise<Array<{ fieldKey: string; incomingValue: string | null; reason: "manual_protected" | "conflict" }>> {
  const [existing] = await tx
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      birthDate: contacts.birthDate,
      personalId: contacts.personalId,
      idCardNumber: contacts.idCardNumber,
      idCardIssuedBy: contacts.idCardIssuedBy,
      idCardValidUntil: contacts.idCardValidUntil,
      idCardIssuedAt: contacts.idCardIssuedAt,
      generalPractitioner: contacts.generalPractitioner,
      street: contacts.street,
      city: contacts.city,
      zip: contacts.zip,
      sourceKind: contacts.sourceKind,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);

  if (!existing) return [];

  const existingSourceKind: ContactSourceKind = (existing.sourceKind as ContactSourceKind) ?? "manual";
  const patch: Record<string, string | null> = {};
  const pendingFields: Array<{ fieldKey: string; incomingValue: string | null; reason: "manual_protected" | "conflict" }> = [];

  for (const fieldDef of CONTACT_MERGE_FIELDS) {
    let incomingRaw: string | null = null;
    for (const key of fieldDef.payloadKeys) {
      const v = payload[key];
      if (hasNonEmptyText(v)) {
        incomingRaw = (v as string).trim();
        break;
      }
    }

    const incomingNormalized = incomingRaw && fieldDef.normalize
      ? fieldDef.normalize(incomingRaw)
      : incomingRaw;

    const decision = resolveFieldMerge(
      existing[fieldDef.fieldKey] as string | null,
      incomingNormalized,
      existingSourceKind
    );

    if (decision.action === "apply_incoming" && decision.resolvedValue != null) {
      patch[fieldDef.fieldKey] = decision.resolvedValue;
    } else if (decision.action === "flag_pending") {
      pendingFields.push({
        fieldKey: fieldDef.fieldKey,
        incomingValue: decision.resolvedValue,
        reason: decision.reason === "manual_protected" ? "manual_protected" : "conflict",
      });
    }
    // keep_existing → no-op
  }

  if (Object.keys(patch).length > 0) {
    await tx
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));
  }

  return pendingFields;
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

/** Check duplicate contract using contract number first, then conservative fallbacks.
 * Slice 3: Zahrnuje sourceContractReviewId match jako nejvyšší prioritu (re-apply safety). */
async function findExistingContractId(
  tenantId: string,
  contactId: string,
  lookup: ExistingContractLookup & { sourceContractReviewId?: string | null },
  tx: typeof db
): Promise<string | null> {
  // Slice 3: Pokud máme sourceContractReviewId, zkusíme přímý match přes tenant (bez vazby na contactId)
  // aby re-apply fungovalo i při edge-case kdy contactId se liší od původního zápisu.
  if (lookup.sourceContractReviewId) {
    const byReview = await tx
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, tenantId),
          eq(contracts.sourceContractReviewId, lookup.sourceContractReviewId)
        )
      )
      .limit(1);
    if (byReview[0]?.id) return byReview[0].id;
  }

  if (
    !hasNonEmptyText(lookup.contractNumber) &&
    !hasNonEmptyText(lookup.institutionName) &&
    !hasNonEmptyText(lookup.productName)
  ) {
    return null;
  }

  const rows = await tx
    .select({
      id: contracts.id,
      contractNumber: contracts.contractNumber,
      partnerName: contracts.partnerName,
      productName: contracts.productName,
      startDate: contracts.startDate,
      segment: contracts.segment,
      sourceContractReviewId: contracts.sourceContractReviewId,
    })
    .from(contracts)
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.contactId, contactId)))
    .limit(50);

  return selectExistingContractId(rows, lookup);
}

export async function applyContractReview(
  input: ApplyContractReviewInput
): Promise<ApplyContractReviewResult> {
  const { reviewId, tenantId, userId, row } = input;

  // ── Slice 1: Runtime guard — missing userId/tenantId must fail before transaction ──
  if (!userId || !userId.trim()) {
    return { ok: false, error: "Apply guard: userId chybí — nelze nastavit advisorId na smlouvě." };
  }
  if (!tenantId || !tenantId.trim()) {
    return { ok: false, error: "Apply guard: tenantId chybí — nelze izolovat data tenanta." };
  }

  // FK contracts.advisor_id / confirmed_by_user_id → user_profiles: same as manual createContract
  try {
    await ensureUserProfileRowForAdvisor(userId);
  } catch (ensureErr) {
    return {
      ok: false,
      error: formatContractAdvisorFkApplyError(ensureErr),
    };
  }

  // ── Slice 1: Idempotency — reviewStatus=applied alone is terminal (even if payload is null) ──
  if (row.reviewStatus === "applied") {
    return { ok: true, payload: row.applyResultPayload ?? {} };
  }

  if (row.reviewStatus !== "approved") {
    capturePublishGuardFailure({
      tenantId,
      reviewId,
      reason: `applyContractReview: reviewStatus="${row.reviewStatus}" is not approved`,
    });
    return { ok: false, error: "Publish guard: review musí být schválena před aplikací do CRM." };
  }

  // ── Slice 1: Pre-apply validation — runs BEFORE transaction boundary ──
  const extractedEnvelope = (row.extractedPayload as DocumentReviewEnvelope | null) ?? ({} as DocumentReviewEnvelope);
  // Re-run alias normalization to ensure all promotions/salvage run with latest logic,
  // even for payloads stored by an older pipeline version.
  if (extractedEnvelope.documentClassification && extractedEnvelope.extractedFields) {
    applyExtractedFieldAliasNormalizations(extractedEnvelope);
  }
  const segmentForValidation = validateSegment(
    (row.extractedPayload as Record<string, unknown> | null)?.segment as string | undefined
  );
  const validationResult = validateBeforeApply(extractedEnvelope, segmentForValidation);
  if (!validationResult.valid) {
    const errorMessages = validationResult.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    return { ok: false, error: `Pre-apply validace selhala: ${errorMessages}` };
  }
  // Warnings are non-blocking — they are logged to resultPayload below

  const attrsFromReview = buildPortfolioAttributesFromExtracted(row.extractedPayload);
  Object.assign(attrsFromReview, mergeIdentityPortfolioFieldsFromExtracted(row.extractedPayload));

  // Fund-library resolution: match extracted fund names/ISINs against catalog.
  // Runs for every contract (idempotent), only populates when investment data present.
  const fundResolution = resolveFundFromPortfolioAttributes(attrsFromReview);
  if (fundResolution.resolvedFundId) {
    attrsFromReview.resolvedFundId = fundResolution.resolvedFundId;
    attrsFromReview.fvSourceType = fundResolution.fvSourceType;
  } else if (fundResolution.resolvedFundCategory) {
    attrsFromReview.resolvedFundCategory = fundResolution.resolvedFundCategory;
    attrsFromReview.fvSourceType = fundResolution.fvSourceType;
  }

  const extractionConfidence = normalizeExtractionConfidence(row.confidence ?? undefined);

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

  const createNewConfirmed = row.createNewClientConfirmed === "true";
  const { contactId: resolvedApplyContactId } = resolveApplyClientContactId(row);
  let effectiveContactId: string | null = resolvedApplyContactId;

  if (!effectiveContactId && !createNewConfirmed) {
    return {
      ok: false,
      error: "Vyberte klienta z kandidátů nebo potvrďte vytvoření nového klienta.",
    };
  }

  const resultPayload: ApplyResultPayload = {};
  const allPendingFields: Array<{ fieldKey: string; incomingValue: string | null; reason: "manual_protected" | "conflict" }> = [];

  // Attach non-blocking validation warnings to trace (non-blocking, continue apply)
  const validationWarnings = validationResult.issues
    .filter((i) => i.severity === "warning")
    .map((i) => i.message);

  // Fáze 9: Resolve extractedPayload pro enforcement engine
  const extractedPayloadForEnforcement = (row.extractedPayload as Record<string, unknown>) ?? {};

  // Supporting document guard — advisor-confirmed reviews bypass this guard.
  // When advisor has explicitly approved and is applying, they take responsibility
  // for the document classification. Only truly supporting docs (payslip, bank statement)
  // that the advisor did NOT override remain guarded.
  const rawIsSupporting = isSupportingDocumentOnly(extractedPayloadForEnforcement);
  // Advisor-confirmed apply: bypass supporting document guard entirely.
  // When advisor explicitly approved the review, they take responsibility for
  // document classification — sensitive attachments, bundles, etc. must not
  // silently prevent contract creation (the "ghost success" bug).
  const isSupporting = rawIsSupporting && row.reviewStatus !== "approved";

  // Kolektory pro enforcement trace
  let contactEnforcementResult: ReturnType<typeof enforceContactPayload> | undefined;
  let contractEnforcementResult: ReturnType<typeof enforceContractPayload> | undefined;
  let paymentEnforcementResult: ReturnType<typeof enforcePaymentPayload> | undefined;

  try {
    await db.transaction(async (tx) => {
      const createClientAction = draftActions.find(
        (a) => a.type === "create_client" || a.type === "create_new_client"
      );
      const hasLinkExisting = draftActions.some((a) => a.type === "link_existing_client");
      let contactEnforce: ReturnType<typeof enforceContactPayload> | undefined;
      if (createClientAction) {
        contactEnforce = enforceContactPayload(
          createClientAction.payload,
          extractedPayloadForEnforcement,
        );
      } else if (hasLinkExisting && effectiveContactId) {
        const synthetic = buildContactMergePayloadFromExtractedEnvelope(extractedPayloadForEnforcement);
        const hasAny = Object.values(synthetic).some(
          (v) => v != null && String(v).trim() !== "",
        );
        if (hasAny) {
          contactEnforce = enforceContactPayload(synthetic, extractedPayloadForEnforcement);
        }
      }
      if (contactEnforce) {
        contactEnforcementResult = contactEnforce;
      }

      if (!effectiveContactId && createNewConfirmed) {
        if (createClientAction) {
          const existing = await findExistingContactId(
            tenantId,
            createClientAction.payload,
            tx as unknown as typeof db
          );
          if (existing) {
            effectiveContactId = existing;
            resultPayload.linkedClientId = existing;
          } else {
            const ep = contactEnforce?.enforcedPayload ?? createClientAction.payload;
            const fallbackFullName =
              hasNonEmptyText(ep.fullName) ? ep.fullName : hasNonEmptyText(createClientAction.payload.fullName) ? createClientAction.payload.fullName : null;
            const splitName = splitContactName(fallbackFullName);

            // firstName/lastName jsou povinné pro vytvoření kontaktu — fallback i při manual_required
            const firstName =
              String(ep.firstName ?? createClientAction.payload.firstName ?? splitName.firstName ?? "").trim() || "Klient";
            const lastName =
              String(ep.lastName ?? createClientAction.payload.lastName ?? splitName.lastName ?? "").trim() || "ze smlouvy";
            const [inserted] = await tx
              .insert(contacts)
              .values({
                tenantId,
                firstName,
                lastName,
                // Slice 2: source_kind = "ai_review" pro všechny kontakty vytvořené z AI review
                sourceKind: "ai_review" as const,
                // Pole s prefill_confirm jdou jako null (needsHumanReview) — nebo jako hodnota pokud prošla enforcement
                email: (ep.email as string)?.trim() || null,
                phone: (ep.phone as string)?.trim() || null,
                birthDate: normalizeDateToISO(ep.birthDate as string) || null,
                personalId: (ep.personalId as string)?.trim() || null,
                idCardNumber: (ep.idCardNumber as string)?.trim() || null,
                idCardIssuedBy: (ep.idCardIssuedBy as string)?.trim() || null,
                idCardValidUntil: normalizeDateToISO(ep.idCardValidUntil as string) || null,
                idCardIssuedAt: normalizeDateToISO(ep.idCardIssuedAt as string) || null,
                generalPractitioner: (ep.generalPractitioner as string)?.trim() || null,
                street:
                  (ep.street as string)?.trim() ||
                  (ep.address as string)?.trim() ||
                  null,
                city: (ep.city as string)?.trim() || null,
                zip: (ep.zip as string)?.trim() || null,
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
      }

      if (effectiveContactId && contactEnforce) {
        // Slice 2: use merge-policy-based update instead of blind patch
        const pendingFromMerge = await updateExistingContactFromPayloadWithMerge(
          tenantId,
          effectiveContactId,
          contactEnforce.enforcedPayload,
          tx as unknown as typeof db
        );
        allPendingFields.push(...pendingFromMerge);
      }

      if (effectiveContactId && !resultPayload.createdClientId) {
        resultPayload.linkedClientId = effectiveContactId;
      }

      let resolvedContractNumberForPaymentSync: string | null = null;

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
          const contractNumberResolved =
            resolveContractReferenceForApply(ep, action.payload, extractedPayloadForEnforcement) ??
            (ep.contractNumber as string)?.trim() ??
            null;
          const rawProductName = (ep.productName as string)?.trim() || null;
          const institutionName =
            (ep.institutionName as string)?.trim() ||
            (action.payload.institutionName as string)?.trim() ||
            null;
          // Strip institution name prefix from product name when AI concatenates them
          const productName = (() => {
            if (!rawProductName || !institutionName) return rawProductName;
            const instLower = institutionName.toLowerCase();
            const prodLower = rawProductName.toLowerCase();
            if (prodLower.startsWith(instLower)) {
              const stripped = rawProductName.slice(institutionName.length).replace(/^[\s\-–·:]+/, "").trim();
              return stripped || rawProductName;
            }
            return rawProductName;
          })();
          const effectiveDate = (ep.effectiveDate as string)?.trim() || null;
          const segment = resolveSegmentForContractApply(action.payload, extractedPayloadForEnforcement);
          const existingContractId = await findExistingContractId(
            tenantId,
            effectiveContactId,
            {
              contractNumber: contractNumberResolved,
              institutionName,
              productName,
              effectiveDate,
              segment,
              // Slice 3: Re-apply safety — sourceContractReviewId jako nejvyšší prioritní match
              sourceContractReviewId: reviewId,
            },
            tx as unknown as typeof db
          );
          // premiumAmount: manual_required nebo do_not_apply → null (nesmí se zapsat jako finální)
          const premiumAmountRaw = (ep.premiumAmount as string | undefined)?.trim() || null;
          const premiumAnnualRaw = (ep.premiumAnnual as string | undefined)?.trim() || null;
          const docTypeRaw = (action.payload.documentType as string)?.trim() || null;
          const docTypeLabel = docTypeRaw
            ? getDocumentTypeLabel(docTypeRaw as PrimaryDocumentType)
            : null;
          const noteParts = [productName, docTypeLabel].filter(Boolean);
          const normalizedStartDate = normalizeDateToISO(effectiveDate) || null;
          const nextNote = noteParts.length ? noteParts.join(" · ") : null;
          if (existingContractId) {
            const [existingRow] = await tx
              .select({
                portfolioAttributes: contracts.portfolioAttributes,
                sourceKind: contracts.sourceKind,
                partnerName: contracts.partnerName,
                productName: contracts.productName,
                contractNumber: contracts.contractNumber,
                startDate: contracts.startDate,
                premiumAmount: contracts.premiumAmount,
                premiumAnnual: contracts.premiumAnnual,
                note: contracts.note,
                partnerId: contracts.partnerId,
                productId: contracts.productId,
              })
              .from(contracts)
              .where(eq(contracts.id, existingContractId))
              .limit(1);
            const prevAttrs =
              (existingRow?.portfolioAttributes as Record<string, unknown> | undefined) ?? {};
            const mergedAttrsForTitle = mergePortfolioAttributesWithPhase1Scalars(prevAttrs, attrsFromReview);
            const preserveManualLineage = existingRow?.sourceKind === "manual";
            const mergedProductName = pickStrongerInvestmentProductName(
              existingRow?.productName ?? null,
              productName,
              mergedAttrsForTitle,
              segment,
            );

            // Catalog FK: resolve only if not already set on existing row
            const resolvedFKs =
              !existingRow?.partnerId && institutionName
                ? await resolveCatalogFKs(
                    tenantId,
                    institutionName,
                    mergedProductName,
                    segment,
                    tx as unknown as typeof db
                  ).catch(() => ({ partnerId: null, productId: null }))
                : { partnerId: existingRow?.partnerId ?? null, productId: existingRow?.productId ?? null };

            await tx
              .update(contracts)
              .set({
                sourceContractReviewId: reviewId,
                ...(preserveManualLineage ? {} : { sourceKind: "ai_review" as const }),
                segment,
                type: segment,
                partnerName: preferExistingValue(existingRow?.partnerName, institutionName),
                productName: mergedProductName,
                contractNumber: preferExistingValue(existingRow?.contractNumber, contractNumberResolved),
                startDate: preferExistingValue(existingRow?.startDate, normalizedStartDate),
                premiumAmount: preferExistingValue(existingRow?.premiumAmount, premiumAmountRaw),
                premiumAnnual: preferExistingValue(existingRow?.premiumAnnual, premiumAnnualRaw),
                note: preferExistingValue(existingRow?.note, nextNote),
                advisorConfirmedAt: new Date(),
                confirmedByUserId: userId,
                visibleToClient: true,
                portfolioStatus: "active",
                portfolioAttributes: mergedAttrsForTitle,
                extractionConfidence,
                ...(resolvedFKs.partnerId ? { partnerId: resolvedFKs.partnerId } : {}),
                ...(resolvedFKs.productId ? { productId: resolvedFKs.productId } : {}),
                updatedAt: new Date(),
              })
              .where(eq(contracts.id, existingContractId));
            resultPayload.createdContractId = existingContractId;
            resolvedContractNumberForPaymentSync =
              preferExistingValue(existingRow?.contractNumber, contractNumberResolved) ?? null;
            continue;
          }
          // Slice 3: Race-safe INSERT — pokud app-level dedupe nic nenašel ale DB unique index
          // zachytí konflikt (race condition), fallback na SELECT existujícího záznamu místo pádu.
          let insertedContractId: string | null = null;
          try {
            const insertProductName = pickStrongerInvestmentProductName(
              null,
              productName,
              attrsFromReview,
              segment,
            );
            // Catalog FK resolution for new contract (soft-fail: null if not found)
            const newFKs = institutionName
              ? await resolveCatalogFKs(
                  tenantId,
                  institutionName,
                  insertProductName,
                  segment,
                  tx as unknown as typeof db
                ).catch(() => ({ partnerId: null, productId: null }))
              : { partnerId: null, productId: null };

            const [inserted] = await tx
              .insert(contracts)
              .values({
                tenantId,
                contactId: effectiveContactId,
                advisorId: userId,
                segment,
                type: segment,
                partnerName: institutionName,
                productName: insertProductName,
                contractNumber: contractNumberResolved,
                startDate: normalizedStartDate,
                premiumAmount: premiumAmountRaw,
                premiumAnnual: premiumAnnualRaw,
                note: nextNote,
                visibleToClient: true,
                portfolioStatus: "active",
                sourceKind: "ai_review",
                sourceContractReviewId: reviewId,
                advisorConfirmedAt: new Date(),
                confirmedByUserId: userId,
                portfolioAttributes: attrsFromReview,
                extractionConfidence,
                ...(newFKs.partnerId ? { partnerId: newFKs.partnerId } : {}),
                ...(newFKs.productId ? { productId: newFKs.productId } : {}),
              })
              .returning({ id: contracts.id });
            insertedContractId = inserted?.id ?? null;
          } catch (insertErr) {
            // Slice 3: Unique index conflict (race condition) — pokus o SELECT existujícího záznamu.
            const isUniqueViolation =
              insertErr instanceof Error &&
              (insertErr.message.includes("unique") ||
                insertErr.message.includes("duplicate") ||
                insertErr.message.includes("23505"));
            if (isUniqueViolation && contractNumberResolved) {
              try {
                Sentry.addBreadcrumb({
                  category: "contract_review.apply",
                  level: "warning",
                  message: "contract_insert_unique_conflict_fallback",
                  data: { reviewId, tenantId, contractNumber: contractNumberResolved.slice(0, 50) },
                });
                const [conflicted] = await tx
                  .select({ id: contracts.id })
                  .from(contracts)
                  .where(
                    and(
                      eq(contracts.tenantId, tenantId),
                      eq(contracts.contractNumber, contractNumberResolved)
                    )
                  )
                  .limit(1);
                insertedContractId = conflicted?.id ?? null;
                // Pokud jsme našli existující, updatujeme sourceContractReviewId pro idempotency
                if (insertedContractId) {
                  await tx
                    .update(contracts)
                    .set({ sourceContractReviewId: reviewId, updatedAt: new Date() })
                    .where(eq(contracts.id, insertedContractId));
                }
              } catch {
                // Fallback selhal — necháme insertedContractId = null, apply pokračuje bez contractId
              }
            } else {
              throw insertErr;
            }
          }
          if (insertedContractId) {
            resultPayload.createdContractId = insertedContractId;
            resolvedContractNumberForPaymentSync = contractNumberResolved;
          }
        } else if (action.type === "create_task") {
          // Auto-task off: tasks are NOT created automatically during CRM write / publish flow.
          // Advisor can still create tasks manually from the draft actions UI.
          continue;
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

          const enforcedPaymentPayload = resolvedContractNumberForPaymentSync
            ? {
                ...paymentEnforce.enforcedPayload,
                contractReference: resolvedContractNumberForPaymentSync,
                contractNumber: resolvedContractNumberForPaymentSync,
              }
            : paymentEnforce.enforcedPayload;
          const enforcedPaymentAction = {
            ...action,
            payload: enforcedPaymentPayload,
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

      if (!isSupporting && !resultPayload.createdContractId && effectiveContactId) {
        const hasContractAction = draftActions.some(
          (a) =>
            a.type === "create_contract" ||
            a.type === "create_or_update_contract_record" ||
            a.type === "create_or_update_contract_production",
        );
        if (hasContractAction) {
          throw new Error(
            "Aplikace do CRM: smlouva/produkt nebyl vytvořen — downstream artefakt chybí.",
          );
        }
      }
    });

    // Slice 2: Propagate pending conflict fields into resultPayload
    if (allPendingFields.length > 0) {
      resultPayload.pendingFields = allPendingFields;
    }

    // Fáze 9: Build enforcement trace pro audit a resultPayload
    const enforcementTrace = buildApplyEnforcementTrace(
      contactEnforcementResult,
      contractEnforcementResult,
      paymentEnforcementResult,
      extractedPayloadForEnforcement,
    );

    // Attach validation warnings to trace (non-blocking)
    if (validationWarnings.length > 0) {
      (resultPayload as Record<string, unknown>).preApplyValidationWarnings = validationWarnings;
    }

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
    const formatted = formatContractAdvisorFkApplyError(err);
    return {
      ok: false,
      error: formatted.trim() ? formatted : "Aplikace do CRM selhala.",
    };
  }

  const contactIdForPortal = resultPayload.linkedClientId ?? resultPayload.createdClientId ?? null;
  if (contactIdForPortal) {
    try {
      resultPayload.portalClientAccess = await loadContactPortalAccessSnapshot(tenantId, contactIdForPortal);
    } catch (portalErr) {
      Sentry.captureException(portalErr);
    }
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
  // visible_to_client=true pokud je review schválena BEZ prefill_confirm polí
  // (s prefill_confirm se visible_to_client nastaví na true až po potvrzení všech pending polí)
  const visibleToClient = isApproved && !hasPrefillConfirmFields;
  return {
    tenantId,
    contactId,
    sourceContractReviewId: reviewId,
    status: isApproved ? ("active" as const) : ("draft" as const),
    visibleToClient,
    paymentType: domainType,
    providerName: (action.payload.provider as string)?.trim() || null,
    productName: (action.payload.productName as string)?.trim() || null,
    contractNumber:
      (action.payload.contractReference as string)?.trim() ||
      (action.payload.contractNumber as string)?.trim() ||
      null,
    beneficiaryName: (action.payload.beneficiaryName as string)?.trim() || null,
    ...(() => {
      const rawAcc =
        (action.payload.recipientAccount as string)?.trim() ||
        (action.payload.accountNumber as string)?.trim() ||
        "";
      const rawBankCode = (action.payload.bankCode as string)?.trim() || "";
      if (!rawAcc) {
        return { accountNumber: null, bankCode: rawBankCode || null };
      }
      const deduped = dedupeCzechAccountTrailingBankCode(rawAcc);
      const slashIdx = deduped.indexOf("/");
      if (slashIdx !== -1) {
        const accPart = deduped.substring(0, slashIdx).trim();
        const codePart = deduped.substring(slashIdx + 1).trim();
        return {
          accountNumber: accPart || null,
          bankCode: codePart || rawBankCode || null,
        };
      }
      return { accountNumber: deduped || null, bankCode: rawBankCode || null };
    })(),
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
