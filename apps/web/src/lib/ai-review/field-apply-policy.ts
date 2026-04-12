/**
 * Evidence-aware apply policy for CRM proposal / apply flow (Fáze 8).
 *
 * Maps each extracted field to an apply policy based on:
 * - displayStatus (Nalezeno / Odvozeno / Chybí)
 * - field sensitivity (HIGH / MEDIUM / LOW)
 * - document family / output mode
 *
 * Policy values:
 *   auto_apply      — applies automatically on advisor approval
 *   prefill_confirm — pre-fills in proposal, advisor must confirm
 *   manual_required — left empty, advisor must fill manually
 *   do_not_apply    — not transferred to CRM at all
 *
 * Advisor-facing labels (no internal enum shown in UI):
 *   "Propíše se automaticky"
 *   "Předvyplněno k potvrzení"
 *   "Vyžaduje ruční doplnění"
 *   "Nepropíše se automaticky"
 */

export type ApplyPolicy =
  | "auto_apply"
  | "prefill_confirm"
  | "manual_required"
  | "do_not_apply";

export type FieldSensitivity = "HIGH" | "MEDIUM" | "LOW";

export type ApplyPolicyDecision = {
  policy: ApplyPolicy;
  label: string;
  requiresConfirmation: boolean;
  reason?: string;
};

/** Fields where incorrect CRM data could cause legal / compliance harm. Never auto-apply without explicit evidence. */
const HIGH_SENSITIVITY_FIELDS = new Set([
  "personalId",
  "birthDate",
  "bankAccount",
  "iban",
  "bankCode",
  "contractNumber",
  "proposalNumber",
  "policyNumber",
  "paymentFrequency",
  "variableSymbol",
  "loanAmount",
  "financedAmount",
  "totalFinancedAmount",
  "intendedInvestment",
  "amountToPay",
  "intermediaryName",
  "intermediaryCompany",
  "intermediaryCode",
  "representedBy",
  "fullName",
  "firstName",
  "lastName",
  "policyholder",
  "borrower",
  "lessee",
  "lesseeName",
  "owner",
  "investor",
  "insuredPerson",
]);

/** Fields safe for pre-fill but should be reviewed before applying. */
const MEDIUM_SENSITIVITY_FIELDS = new Set([
  "phone",
  "email",
  "address",
  "productName",
  "productType",
  "institution",
  "insurer",
  "lender",
  "provider",
  "monthlyPremium",
  "annualPremium",
  "totalMonthlyPremium",
  "installmentAmount",
  "duration",
  "signingDate",
  "startDate",
  "endDate",
  "effectiveDate",
  "firstDrawdownDate",
  "firstInstallmentDate",
  "fund",
  "isin",
]);

/** Fields that carry reference metadata and are safe to apply automatically. */
const LOW_SENSITIVITY_FIELDS = new Set([
  "documentType",
  "documentFamily",
  "productCategory",
  "segment",
  "currency",
  "language",
  "pageCount",
]);

/**
 * Output modes where all fields are at most prefill_confirm — never auto-apply.
 * Business rule: proposal / offer are FINAL INPUT by default and therefore NOT in this set.
 * Only explicit modelation / illustration / non_binding_projection are non-final.
 */
const NON_FINAL_OUTPUT_MODES = new Set([
  "reference_or_supporting_document",
  "supporting_document",
  "modelation",
  "illustration",
  "non_binding_projection",
  "precontract",
  "amendment",
]);

export function getFieldSensitivity(fieldKey: string): FieldSensitivity {
  if (HIGH_SENSITIVITY_FIELDS.has(fieldKey)) return "HIGH";
  if (MEDIUM_SENSITIVITY_FIELDS.has(fieldKey)) return "MEDIUM";
  if (LOW_SENSITIVITY_FIELDS.has(fieldKey)) return "LOW";
  // Default unknown fields to MEDIUM to be safe
  return "MEDIUM";
}

/**
 * Derive the apply policy for a single field.
 *
 * @param fieldKey - normalized field key (e.g. "fullName", "contractNumber")
 * @param displayStatus - advisor-facing evidence status from Fáze 5/6 ("Nalezeno" | "Odvozeno" | "Chybí" | undefined)
 * @param outputMode - document output mode (e.g. "life_insurance_final_contract", "reference_or_supporting_document")
 * @param hasConflict - true if field quality gate or payment/contract conflict was detected
 */
export function deriveFieldApplyPolicy(
  fieldKey: string,
  displayStatus: "Nalezeno" | "Odvozeno" | "Chybí" | undefined,
  outputMode?: string,
  hasConflict?: boolean
): ApplyPolicyDecision {
  // Supporting / reference / non-final documents: never auto-apply contract fields
  if (outputMode && NON_FINAL_OUTPUT_MODES.has(outputMode)) {
    return {
      policy: "do_not_apply",
      label: "Nepropíše se automaticky",
      requiresConfirmation: false,
      reason: "supporting_or_non_final_document",
    };
  }

  // Fields with detected conflict always require manual review
  if (hasConflict) {
    return {
      policy: "manual_required",
      label: "Vyžaduje ruční doplnění",
      requiresConfirmation: true,
      reason: "conflict_detected",
    };
  }

  const sensitivity = getFieldSensitivity(fieldKey);

  if (displayStatus === "Chybí") {
    return {
      policy: "manual_required",
      label: "Vyžaduje ruční doplnění",
      requiresConfirmation: true,
      reason: "field_missing",
    };
  }

  if (displayStatus === "Odvozeno") {
    // HIGH-sensitivity inferred fields must not auto-apply
    if (sensitivity === "HIGH") {
      return {
        policy: "prefill_confirm",
        label: "Předvyplněno k potvrzení",
        requiresConfirmation: true,
        reason: "inferred_high_sensitivity",
      };
    }
    // MEDIUM inferred: prefill but flag
    return {
      policy: "prefill_confirm",
      label: "Předvyplněno k potvrzení",
      requiresConfirmation: true,
      reason: "inferred_field",
    };
  }

  // displayStatus === "Nalezeno" or undefined (legacy, treat conservatively)
  if (!displayStatus) {
    // No evidence metadata — treat as MEDIUM regardless
    if (sensitivity === "LOW") {
      return {
        policy: "auto_apply",
        label: "Propíše se automaticky",
        requiresConfirmation: false,
        reason: "explicit_low_sensitivity",
      };
    }
    return {
      policy: "prefill_confirm",
      label: "Předvyplněno k potvrzení",
      requiresConfirmation: true,
      reason: "no_evidence_metadata",
    };
  }

  // Explicit / Nalezeno
  switch (sensitivity) {
    case "HIGH":
      // Even explicit HIGH-sensitivity fields go through prefill_confirm for safety
      return {
        policy: "prefill_confirm",
        label: "Předvyplněno k potvrzení",
        requiresConfirmation: true,
        reason: "explicit_high_sensitivity",
      };
    case "MEDIUM":
      return {
        policy: "prefill_confirm",
        label: "Předvyplněno k potvrzení",
        requiresConfirmation: true,
        reason: "explicit_medium_sensitivity",
      };
    case "LOW":
      return {
        policy: "auto_apply",
        label: "Propíše se automaticky",
        requiresConfirmation: false,
        reason: "explicit_low_sensitivity",
      };
  }
}

/**
 * Build a summary of apply policy for a group of fields.
 * Returns counts of each policy level for UI summary display.
 */
export function summarizeApplyPolicies(
  fields: Array<{ applyPolicy?: ApplyPolicy }>
): { autoApply: number; prefillConfirm: number; manualRequired: number; doNotApply: number } {
  let autoApply = 0;
  let prefillConfirm = 0;
  let manualRequired = 0;
  let doNotApply = 0;
  for (const f of fields) {
    switch (f.applyPolicy) {
      case "auto_apply": autoApply++; break;
      case "prefill_confirm": prefillConfirm++; break;
      case "manual_required": manualRequired++; break;
      case "do_not_apply": doNotApply++; break;
    }
  }
  return { autoApply, prefillConfirm, manualRequired, doNotApply };
}
