import type { AiProvenanceKind } from "@/lib/portal/ai-review-provenance";
import type { ContactAiProvenanceResult } from "@/app/actions/contacts";

/**
 * Jednotná field-level provenance pro identitní pole kontaktu (desktop + mobile).
 */
export function resolveContactIdentityFieldProvenance(
  fieldKey: string,
  provenance: ContactAiProvenanceResult | null,
): { kind: AiProvenanceKind; reviewId: string; confirmedAt?: string | null } | null {
  if (!provenance) return null;
  if (provenance.confirmedFields.includes(fieldKey)) {
    return { kind: "confirmed", reviewId: provenance.reviewId, confirmedAt: provenance.appliedAt };
  }
  if (provenance.autoAppliedFields.includes(fieldKey)) {
    return { kind: "auto_applied", reviewId: provenance.reviewId };
  }
  if (provenance.pendingFields.includes(fieldKey)) {
    return { kind: "pending_review", reviewId: provenance.reviewId };
  }
  if (provenance.manualRequiredFields.includes(fieldKey)) {
    return { kind: "manual", reviewId: provenance.reviewId };
  }
  return null;
}

/**
 * Zobrazit řádek identity tabulky, pokud má hodnotu nebo pending/manual stav.
 */
export function shouldShowContactIdentityRow(
  fieldKey: string,
  hasValue: boolean,
  provenance: ContactAiProvenanceResult | null,
): boolean {
  if (hasValue) return true;
  const p = resolveContactIdentityFieldProvenance(fieldKey, provenance);
  return p?.kind === "pending_review" || p?.kind === "manual";
}
