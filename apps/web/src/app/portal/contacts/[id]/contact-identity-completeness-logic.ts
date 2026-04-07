/**
 * Fáze 14/15: Čistá logika pro ContactIdentityCompletenessGuard — bez závislostí na server-only.
 * Importovatelná jak z Client Componentů, tak z testů.
 */

/**
 * Stav identity pole pro completeness guard.
 * - "ok"           : pole je přítomno a potvrzeno nebo auto-aplikováno z AI Review
 * - "pending_ai"   : pole chybí v kontaktu, ale čeká na potvrzení v AI Review
 * - "manual"       : pole chybí, žádný AI pending zdroj, vyžaduje ruční doplnění
 */
export type IdentityFieldStatus = "ok" | "pending_ai" | "manual";

export type IdentityFieldResult = {
  key: string;
  label: string;
  status: IdentityFieldStatus;
};

export type ContactIdentityInput = {
  birthDate?: string | null;
  personalId?: string | null;
};

export type ContactProvenanceInput = {
  reviewId: string;
  confirmedFields: string[];
  autoAppliedFields: string[];
  pendingFields: string[];
} | null;

/** Klíčová identity pole kontaktu, která guard sleduje. */
export const IDENTITY_FIELDS: { key: string; label: string }[] = [
  { key: "birthDate", label: "Datum narození" },
  { key: "personalId", label: "Rodné číslo" },
];

/**
 * Fáze 14: Contact Identity Completeness Guard — čistá logická funkce.
 *
 * Rozlišuje:
 *   - pole přítomno + AI confirmed/auto_applied → žádné upozornění
 *   - pole chybí + čeká na potvrzení z AI Review (pendingFields) → "pending_ai"
 *   - pole chybí + žádný AI pending zdroj → "manual"
 *
 * Supporting document guard: pokud provenance nemá contactEnforcement (pouze
 * supportingDocumentGuard), pending/manual CTA pro contact se nezobrazí.
 */
export function resolveIdentityCompleteness(
  contact: ContactIdentityInput,
  provenance: ContactProvenanceInput,
): IdentityFieldResult[] {
  const fieldValues: Record<string, string | null | undefined> = {
    birthDate: contact.birthDate,
    personalId: contact.personalId,
  };

  return IDENTITY_FIELDS.map(({ key, label }) => {
    const value = fieldValues[key];
    const hasValue = Boolean(value?.trim?.() ?? value);

    if (hasValue) {
      return { key, label, status: "ok" as const };
    }

    if (provenance) {
      if (
        provenance.confirmedFields.includes(key) ||
        provenance.autoAppliedFields.includes(key)
      ) {
        return { key, label, status: "ok" as const };
      }

      if (provenance.pendingFields.includes(key)) {
        return { key, label, status: "pending_ai" as const };
      }
    }

    return { key, label, status: "manual" as const };
  });
}

export function buildIncompleteMessage(incomplete: IdentityFieldResult[]): string {
  const pendingAi = incomplete.filter((r) => r.status === "pending_ai");
  const manual = incomplete.filter((r) => r.status === "manual");

  const parts: string[] = [];

  if (pendingAi.length > 0) {
    const labels = pendingAi.map((f) => f.label).join(" a ");
    parts.push(
      pendingAi.length === 1
        ? `${labels} čeká na potvrzení z AI Review.`
        : `${labels} čekají na potvrzení z AI Review.`
    );
  }

  if (manual.length > 0) {
    const labels = manual.map((f) => f.label).join(" a ");
    parts.push(
      manual.length === 1
        ? `${labels} vyžaduje ruční doplnění.`
        : `${labels} vyžadují ruční doplnění.`
    );
  }

  return parts.join(" ");
}
