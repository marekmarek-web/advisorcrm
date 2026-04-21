/**
 * Fáze 9 — Apply Policy Enforcement
 *
 * Centrální enforcement vrstva těsně před DB write / CRM apply.
 * Zajišťuje, že applyPolicy z Fáze 8 se skutečně promítne do payloadu:
 *
 *   auto_apply      → pole se zahrne do finálního payloadu (bez needsHumanReview)
 *   prefill_confirm → pole se zahrne jen jako předvyplněné s needsHumanReview=true
 *   manual_required → pole se NESMÍ zapsat jako potvrzená hodnota (null/prázdné)
 *   do_not_apply    → pole se vůbec NESMÍ dostat do payloadu
 *
 * Používá deriveFieldApplyPolicy z field-apply-policy.ts — stejný engine jako UI.
 */

import {
  deriveFieldApplyPolicy,
  type ApplyPolicy,
} from "@/lib/ai-review/field-apply-policy";
import {
  detectPaymentFrequencyConflict,
  detectContractVsVariableSymbolConflict,
} from "@/lib/ai/field-quality-gate";

// ─── Typy ─────────────────────────────────────────────────────────────────────

/** Výsledek enforcement rozhodnutí pro jedno pole. */
export type FieldEnforcementDecision = {
  policy: ApplyPolicy;
  /** true = pole se zahrne do finálního payloadu */
  include: boolean;
  /** true = pole je označeno jako human-review/pending */
  needsHumanReview: boolean;
  /** true = pole je vyloučeno z payloadu úplně */
  excluded: boolean;
  /** true = pole se nemá tvářit jako finálně zapsané — nechat prázdné/null */
  leaveEmpty: boolean;
  reason: string;
};

/** Výsledek enforcement pro celý payload (trace/audit). */
export type PayloadEnforcementResult<T extends Record<string, unknown>> = {
  /** Čistý payload pro DB write — obsahuje jen auto_apply a prefill_confirm pole */
  enforcedPayload: T;
  /** Pole označená jako needsHumanReview (prefill_confirm) */
  pendingConfirmationFields: string[];
  /** Pole vynechaná (do_not_apply) */
  excludedFields: string[];
  /** Pole ponechaná prázdná/null (manual_required) */
  manualRequiredFields: string[];
  /** Pole zapsaná bez omezení (auto_apply) */
  autoAppliedFields: string[];
  /** Plné trace pro audit/debug */
  trace: Record<string, FieldEnforcementDecision>;
};

// ─── Field-level enforcement ───────────────────────────────────────────────────

/** Pomocné typy pro evidenci z extractedPayload envelopy. */
type ExtractedFieldCell = {
  value?: unknown;
  status?: string;
  confidence?: number;
  evidenceTier?: string;
};

/** Načte displayStatus z extraktovaného pole envelopy (kompatibilní s Fáze 5/6). */
function resolveDisplayStatus(
  cell: ExtractedFieldCell | undefined
): "Nalezeno" | "Odvozeno" | "Chybí" | undefined {
  if (!cell) return undefined;
  const s = cell.status;
  // F0-2 (C-02): "manual" / "manual_edit" / "confirmed" — advisor pole vyplnil
  // v UI. Musíme ho brát jako plnohodnotně nalezené, aby enforcement NEpouštěl
  // do_not_apply/manual_required a pole se dostalo do DB.
  if (s === "manual" || s === "manual_edit" || s === "confirmed") return "Nalezeno";
  if (s === "extracted" || s === "found") return "Nalezeno";
  if (s === "inferred" || s === "derived" || s === "inferred_low_confidence") return "Odvozeno";
  if (s === "missing" || s === "not_found" || !cell.value) return "Chybí";
  // Fallback: pokud existuje evidenceTier
  if (cell.evidenceTier === "direct") return "Nalezeno";
  if (cell.evidenceTier === "inferred" || cell.evidenceTier === "derived") return "Odvozeno";
  if (cell.evidenceTier === "absent") return "Chybí";
  // Má hodnotu, ale neznámý status → konzervativně "Odvozeno"
  return cell.value != null ? "Odvozeno" : "Chybí";
}

/**
 * Odvozuje enforcement rozhodnutí pro jedno pole.
 * Totožná logika jako UI (deriveFieldApplyPolicy), takže preview = realita.
 */
export function enforceField(
  fieldKey: string,
  cell: ExtractedFieldCell | undefined,
  outputMode: string | undefined,
  hasConflict: boolean,
): FieldEnforcementDecision {
  const displayStatus = resolveDisplayStatus(cell);
  const decision = deriveFieldApplyPolicy(fieldKey, displayStatus, outputMode, hasConflict);
  const policy = decision.policy;

  switch (policy) {
    case "auto_apply":
      return {
        policy,
        include: true,
        needsHumanReview: false,
        excluded: false,
        leaveEmpty: false,
        reason: decision.reason ?? "auto_apply",
      };
    case "prefill_confirm":
      return {
        policy,
        include: true,
        needsHumanReview: true,
        excluded: false,
        leaveEmpty: false,
        reason: decision.reason ?? "prefill_confirm",
      };
    case "manual_required":
      return {
        policy,
        include: false,
        needsHumanReview: false,
        excluded: false,
        leaveEmpty: true,
        reason: decision.reason ?? "manual_required",
      };
    case "do_not_apply":
      return {
        policy,
        include: false,
        needsHumanReview: false,
        excluded: true,
        leaveEmpty: false,
        reason: decision.reason ?? "do_not_apply",
      };
  }
}

// ─── Contract payload enforcement ─────────────────────────────────────────────

/**
 * Mapování: klíč v draftAction.payload → kanonický fieldKey pro enforcement.
 * Pokrývá překlady z draft-actions build logiky.
 */
const CONTRACT_PAYLOAD_FIELD_MAP: Record<string, string> = {
  contractNumber: "contractNumber",
  institutionName: "institutionName",
  productName: "productName",
  effectiveDate: "effectiveDate",
  expirationDate: "endDate",
  premiumAmount: "premiumAmount",
  premiumAnnual: "annualPremium",
  segment: "segment",
  documentType: "documentType",
  lifecycleStatus: "documentType",
};

const CONTACT_PAYLOAD_FIELD_MAP: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  fullName: "fullName",
  email: "email",
  phone: "phone",
  birthDate: "birthDate",
  personalId: "personalId",
  companyId: "companyId",
  address: "address",
  street: "address",
  city: "address",
  zip: "address",
  idCardNumber: "idCardNumber",
  idCardIssuedBy: "idCardIssuedBy",
  idCardValidUntil: "idCardValidUntil",
  idCardIssuedAt: "idCardIssuedAt",
  generalPractitioner: "generalPractitioner",
};

const PAYMENT_PAYLOAD_FIELD_MAP: Record<string, string> = {
  recipientAccount: "bankAccount",
  accountNumber: "bankAccount",
  iban: "iban",
  bankCode: "bankCode",
  variableSymbol: "variableSymbol",
  specificSymbol: "specificSymbol",
  constantSymbol: "constantSymbol",
  regularAmount: "premiumAmount",
  amount: "premiumAmount",
  currency: "currency",
  frequency: "paymentFrequency",
  firstDueDate: "startDate",
  firstPaymentDate: "startDate",
  provider: "provider",
  contractReference: "contractNumber",
  obligationName: "productName",
};

/** Pole v paymentu, která jsou bezpečná pro auto_apply i bez evidence (platební logistika). */
const PAYMENT_LOGISTICS_FIELDS = new Set([
  "obligationName",
  "paymentType",
  "currency",
  "clientNote",
  "beneficiaryName",
  "payerName",
]);

// ─── Conflict detection ze surového extractedPayload ──────────────────────────

function detectConflictsFromEnvelope(
  extractedPayload: Record<string, unknown>
): { paymentConflict: boolean; contractConflict: boolean } {
  const ef = extractedPayload?.extractedFields as
    | Record<string, { value?: unknown; status?: string } | undefined>
    | undefined;
  if (!ef) return { paymentConflict: false, contractConflict: false };

  const payConflict = detectPaymentFrequencyConflict(ef);
  const contractConflict = detectContractVsVariableSymbolConflict(ef);
  return {
    paymentConflict: payConflict.hasConflict,
    contractConflict: contractConflict.hasConflict,
  };
}

/** Vrátí extractedFields z envelopy nebo undefined. */
function getExtractedFields(
  extractedPayload: Record<string, unknown>
): Record<string, ExtractedFieldCell | undefined> | undefined {
  const ef = extractedPayload?.extractedFields;
  if (!ef || typeof ef !== "object" || Array.isArray(ef)) return undefined;
  return ef as Record<string, ExtractedFieldCell | undefined>;
}

/** Vrátí outputMode z extractedPayload (envelopa). */
function resolveOutputMode(extractedPayload: Record<string, unknown>): string | undefined {
  const dc = extractedPayload?.documentClassification as Record<string, unknown> | undefined;
  const lifecycle = dc?.lifecycleStatus as string | undefined;
  if (lifecycle === "modelation" || lifecycle === "illustration") return "modelation";
  if (lifecycle === "proposal") return "precontract";
  const primary = dc?.primaryType as string | undefined;
  if (
    primary === "payslip" ||
    primary === "payslip_document" ||
    primary === "income_proof_document" ||
    primary === "income_confirmation" ||
    primary === "tax_return" ||
    primary === "corporate_tax_return" ||
    primary === "self_employed_tax_or_income_document" ||
    primary === "bank_statement" ||
    primary === "identity_document" ||
    primary === "medical_questionnaire" ||
    primary === "consent_or_declaration"
  ) {
    return "reference_or_supporting_document";
  }
  return undefined;
}

// ─── Payload enforcement pro kontaktní data ───────────────────────────────────

/**
 * Enforceuje kontaktní payload (create_client / create_new_client action).
 * Vrací pouze pole, která prošla enforcement filtrem.
 */
export function enforceContactPayload(
  payload: Record<string, unknown>,
  extractedPayload: Record<string, unknown>,
): PayloadEnforcementResult<Record<string, unknown>> {
  const ef = getExtractedFields(extractedPayload);
  const outputMode = resolveOutputMode(extractedPayload);
  const { paymentConflict } = detectConflictsFromEnvelope(extractedPayload);

  const enforced: Record<string, unknown> = {};
  const trace: Record<string, FieldEnforcementDecision> = {};
  const pendingConfirmationFields: string[] = [];
  const excludedFields: string[] = [];
  const manualRequiredFields: string[] = [];
  const autoAppliedFields: string[] = [];

  for (const [payloadKey, value] of Object.entries(payload)) {
    if (value == null || value === "") continue;

    const fieldKey = CONTACT_PAYLOAD_FIELD_MAP[payloadKey] ?? payloadKey;
    const cell = ef?.[fieldKey] ?? ef?.[payloadKey];

    // hasConflict: u kontaktních polí nemáme platební/smluvní konflikt — jen identity conflict
    const hasConflict = paymentConflict && (payloadKey === "phone" || payloadKey === "email");

    const decision = enforceField(fieldKey, cell, outputMode, hasConflict);
    trace[payloadKey] = decision;

    if (decision.excluded) {
      excludedFields.push(payloadKey);
      continue;
    }
    if (decision.leaveEmpty) {
      manualRequiredFields.push(payloadKey);
      continue;
    }
    enforced[payloadKey] = value;
    if (decision.needsHumanReview) {
      pendingConfirmationFields.push(payloadKey);
    } else {
      autoAppliedFields.push(payloadKey);
    }
  }

  return {
    enforcedPayload: enforced,
    pendingConfirmationFields,
    excludedFields,
    manualRequiredFields,
    autoAppliedFields,
    trace,
  };
}

// ─── Payload enforcement pro smluvní data ─────────────────────────────────────

/**
 * Enforceuje smluvní payload (create_contract / create_or_update_contract_record).
 * Vrací enforced payload + metadata pro needsHumanReview flagging.
 */
export function enforceContractPayload(
  payload: Record<string, unknown>,
  extractedPayload: Record<string, unknown>,
): PayloadEnforcementResult<Record<string, unknown>> {
  const ef = getExtractedFields(extractedPayload);
  const outputMode = resolveOutputMode(extractedPayload);
  const { paymentConflict, contractConflict } = detectConflictsFromEnvelope(extractedPayload);

  const enforced: Record<string, unknown> = {};
  const trace: Record<string, FieldEnforcementDecision> = {};
  const pendingConfirmationFields: string[] = [];
  const excludedFields: string[] = [];
  const manualRequiredFields: string[] = [];
  const autoAppliedFields: string[] = [];

  for (const [payloadKey, value] of Object.entries(payload)) {
    if (value == null || value === "") continue;

    const fieldKey = CONTRACT_PAYLOAD_FIELD_MAP[payloadKey] ?? payloadKey;
    const cell = ef?.[fieldKey] ?? ef?.[payloadKey];

    const hasConflict =
      (contractConflict && (payloadKey === "contractNumber" || payloadKey === "variableSymbol")) ||
      (paymentConflict && (payloadKey === "premiumAmount" || payloadKey === "premiumAnnual"));

    const decision = enforceField(fieldKey, cell, outputMode, hasConflict);
    trace[payloadKey] = decision;

    if (decision.excluded) {
      excludedFields.push(payloadKey);
      continue;
    }
    if (decision.leaveEmpty) {
      manualRequiredFields.push(payloadKey);
      continue;
    }
    enforced[payloadKey] = value;
    if (decision.needsHumanReview) {
      pendingConfirmationFields.push(payloadKey);
    } else {
      autoAppliedFields.push(payloadKey);
    }
  }

  return {
    enforcedPayload: enforced,
    pendingConfirmationFields,
    excludedFields,
    manualRequiredFields,
    autoAppliedFields,
    trace,
  };
}

// ─── Payload enforcement pro platební data ────────────────────────────────────

/**
 * Enforceuje platební payload (create_payment_setup / create_payment).
 * Platební logistická pole (obligationName, currency, …) jsou auto_apply.
 * Platební identifikátory (iban, variableSymbol, …) podléhají plné enforcement.
 */
export function enforcePaymentPayload(
  payload: Record<string, unknown>,
  extractedPayload: Record<string, unknown>,
): PayloadEnforcementResult<Record<string, unknown>> {
  const ef = getExtractedFields(extractedPayload);
  const outputMode = resolveOutputMode(extractedPayload);
  const { paymentConflict, contractConflict } = detectConflictsFromEnvelope(extractedPayload);

  const enforced: Record<string, unknown> = {};
  const trace: Record<string, FieldEnforcementDecision> = {};
  const pendingConfirmationFields: string[] = [];
  const excludedFields: string[] = [];
  const manualRequiredFields: string[] = [];
  const autoAppliedFields: string[] = [];

  for (const [payloadKey, value] of Object.entries(payload)) {
    if (value == null || value === "") continue;

    // Logistická pole nejsou citlivá — auto_apply vždy
    if (PAYMENT_LOGISTICS_FIELDS.has(payloadKey)) {
      enforced[payloadKey] = value;
      autoAppliedFields.push(payloadKey);
      trace[payloadKey] = {
        policy: "auto_apply",
        include: true,
        needsHumanReview: false,
        excluded: false,
        leaveEmpty: false,
        reason: "payment_logistics_field",
      };
      continue;
    }

    const fieldKey = PAYMENT_PAYLOAD_FIELD_MAP[payloadKey] ?? payloadKey;
    const cell = ef?.[fieldKey] ?? ef?.[payloadKey];

    const hasConflict =
      (paymentConflict && (payloadKey === "frequency" || payloadKey === "regularAmount")) ||
      (contractConflict && (payloadKey === "variableSymbol" || payloadKey === "contractReference"));

    const decision = enforceField(fieldKey, cell, outputMode, hasConflict);
    trace[payloadKey] = decision;

    if (decision.excluded) {
      excludedFields.push(payloadKey);
      continue;
    }
    if (decision.leaveEmpty) {
      manualRequiredFields.push(payloadKey);
      continue;
    }
    enforced[payloadKey] = value;
    if (decision.needsHumanReview) {
      pendingConfirmationFields.push(payloadKey);
    } else {
      autoAppliedFields.push(payloadKey);
    }
  }

  return {
    enforcedPayload: enforced,
    pendingConfirmationFields,
    excludedFields,
    manualRequiredFields,
    autoAppliedFields,
    trace,
  };
}

// ─── Supporting document guard ─────────────────────────────────────────────────

/**
 * Vrací true pokud je dokument supporting/reference a NESMÍ generovat contract apply.
 * Payslip, daňové přiznání, výpis z účtu → do_not_apply pro všechna contract-like pole.
 */
export function isSupportingDocumentOnly(extractedPayload: Record<string, unknown>): boolean {
  const dc = extractedPayload?.documentClassification as Record<string, unknown> | undefined;
  const primary = dc?.primaryType as string | undefined;
  const lifecycle = dc?.lifecycleStatus as string | undefined;
  const ph = extractedPayload?.publishHints as Record<string, unknown> | undefined;
  const pm = extractedPayload?.packetMeta as Record<string, unknown> | undefined;

  const SUPPORTING_TYPES = new Set([
    "payslip",
    "payslip_document",
    "income_proof_document",
    "income_confirmation",
    "tax_return",
    "corporate_tax_return",
    "self_employed_tax_or_income_document",
    "bank_statement",
    "supporting_document",
    "reference_document",
    "medical_questionnaire",
    "identity_document",
    "consent_or_declaration",
    "aml_fatca_form",
    "attachment_only",
    "other_non_publishable",
  ]);

  if (primary && SUPPORTING_TYPES.has(primary)) return true;
  if (lifecycle === "modelation" || lifecycle === "illustration") return false; // neblokovat, ale omezit
  if (ph?.sensitiveAttachmentOnly === true) return true;
  if (pm?.primarySubdocumentType) {
    const sub = String(pm.primarySubdocumentType);
    if (SUPPORTING_TYPES.has(sub)) return true;
  }

  return false;
}

// ─── Aggregate apply trace ─────────────────────────────────────────────────────

/** Celkový trace pro audit log po apply. */
export type ApplyPolicyEnforcementTrace = {
  contactEnforcement?: PayloadEnforcementResult<Record<string, unknown>>;
  contractEnforcement?: PayloadEnforcementResult<Record<string, unknown>>;
  paymentEnforcement?: PayloadEnforcementResult<Record<string, unknown>>;
  supportingDocumentGuard: boolean;
  outputMode: string | undefined;
  summary: {
    totalAutoApplied: number;
    totalPendingConfirmation: number;
    totalManualRequired: number;
    totalExcluded: number;
  };
};

export function buildApplyEnforcementTrace(
  contactResult?: PayloadEnforcementResult<Record<string, unknown>>,
  contractResult?: PayloadEnforcementResult<Record<string, unknown>>,
  paymentResult?: PayloadEnforcementResult<Record<string, unknown>>,
  extractedPayload?: Record<string, unknown>,
): ApplyPolicyEnforcementTrace {
  const outputMode = extractedPayload ? resolveOutputMode(extractedPayload) : undefined;
  const supporting = extractedPayload ? isSupportingDocumentOnly(extractedPayload) : false;

  const sum = (arr: PayloadEnforcementResult<Record<string, unknown>> | undefined, key: keyof PayloadEnforcementResult<Record<string, unknown>>) =>
    Array.isArray(arr?.[key]) ? (arr![key] as string[]).length : 0;

  return {
    contactEnforcement: contactResult,
    contractEnforcement: contractResult,
    paymentEnforcement: paymentResult,
    supportingDocumentGuard: supporting,
    outputMode,
    summary: {
      totalAutoApplied:
        sum(contactResult, "autoAppliedFields") +
        sum(contractResult, "autoAppliedFields") +
        sum(paymentResult, "autoAppliedFields"),
      totalPendingConfirmation:
        sum(contactResult, "pendingConfirmationFields") +
        sum(contractResult, "pendingConfirmationFields") +
        sum(paymentResult, "pendingConfirmationFields"),
      totalManualRequired:
        sum(contactResult, "manualRequiredFields") +
        sum(contractResult, "manualRequiredFields") +
        sum(paymentResult, "manualRequiredFields"),
      totalExcluded:
        sum(contactResult, "excludedFields") +
        sum(contractResult, "excludedFields") +
        sum(paymentResult, "excludedFields"),
    },
  };
}
