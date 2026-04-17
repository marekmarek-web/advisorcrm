import type { FieldStatus, ApplyResultPayload } from "./types";

/**
 * Resolves the effective visual status for an extracted field, taking into account:
 * - Local (pre-apply) confirmation by the advisor via the per-field Confirm button
 * - Post-apply enforcement trace (auto-applied fields)
 * - Post-apply confirmed fields trace (per-field confirmPendingField / bulk)
 *
 * Rule: `error` (no value) stays `error` — confirming cannot produce a missing value.
 * `warning` (low AI confidence but valid value) upgrades to `success` once the advisor
 * confirms or the enforcement write-through records it as auto-applied / confirmed.
 */
export function resolveEffectiveFieldStatus(params: {
  fieldId: string;
  fieldStatus: FieldStatus;
  locallyConfirmed: boolean;
  applyResultPayload?: ApplyResultPayload;
}): FieldStatus {
  const { fieldId, fieldStatus, locallyConfirmed, applyResultPayload } = params;

  // Keep error — confirmation doesn't conjure a missing value
  if (fieldStatus === "error") return "error";
  if (fieldStatus === "success") return "success";

  // fieldStatus === "warning": escalate to success via advisor confirmation

  // 1. Pre-apply: advisor clicked Confirm on this field in the review UI
  if (locallyConfirmed) return "success";

  if (!applyResultPayload) return "warning";

  const trace = applyResultPayload.policyEnforcementTrace;
  const confirmedTrace = (applyResultPayload as Record<string, unknown>).confirmedFieldsTrace as
    | Record<string, unknown>
    | undefined;

  // Extract the leaf key from field.id ("section.leafKey" → "leafKey")
  const leafKey = fieldId.includes(".") ? fieldId.split(".").at(-1)! : fieldId;

  // 2. Post-apply: field was auto-applied by the enforcement policy
  if (trace) {
    const autoApplied = [
      ...(trace.contactEnforcement?.autoAppliedFields ?? []),
      ...(trace.contractEnforcement?.autoAppliedFields ?? []),
      ...(trace.paymentEnforcement?.autoAppliedFields ?? []),
    ];
    if (autoApplied.includes(leafKey)) return "success";
  }

  // 3. Post-apply: advisor explicitly confirmed via confirmPendingField / confirmAll
  if (confirmedTrace && leafKey in confirmedTrace) return "success";

  return "warning";
}
