import Link from "next/link";
import { AlertCircle, Clock, Pencil } from "lucide-react";
import type { ContactAiProvenanceResult } from "@/app/actions/contacts";
import type { ContactRow } from "@/app/actions/contacts";

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

/** Klíčová identity pole kontaktu, která guard sleduje. */
const IDENTITY_FIELDS: { key: string; label: string }[] = [
  { key: "birthDate", label: "Datum narození" },
  { key: "personalId", label: "Rodné číslo" },
];

/**
 * Fáze 14: Contact Identity Completeness Guard.
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
  contact: Pick<ContactRow, "birthDate" | "personalId">,
  provenance: ContactAiProvenanceResult,
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

    // Pole chybí — zjisti zda existuje AI pending zdroj
    if (provenance) {
      // Pole je v confirmed nebo auto_applied → bylo vyplněno dříve ale contact nemá hodnotu?
      // (edge case: contact row nemá hodnotu, ale trace říká applied — guard mlčí)
      if (
        provenance.confirmedFields.includes(key) ||
        provenance.autoAppliedFields.includes(key)
      ) {
        return { key, label, status: "ok" as const };
      }

      // Pole čeká na potvrzení v AI Review
      if (provenance.pendingFields.includes(key)) {
        return { key, label, status: "pending_ai" as const };
      }
    }

    return { key, label, status: "manual" as const };
  });
}

type Props = {
  contact: Pick<ContactRow, "birthDate" | "personalId">;
  provenance: ContactAiProvenanceResult;
  contactId: string;
};

/**
 * Jemný completeness banner v detailu klienta.
 * Nezobrazuje se, pokud jsou všechna klíčová pole splněna.
 */
export function ContactIdentityCompletenessGuard({ contact, provenance, contactId }: Props) {
  const results = resolveIdentityCompleteness(contact, provenance);
  const incomplete = results.filter((r) => r.status !== "ok");

  if (incomplete.length === 0) return null;

  const pendingAiFields = incomplete.filter((r) => r.status === "pending_ai");
  const manualFields = incomplete.filter((r) => r.status === "manual");

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <AlertCircle
        size={16}
        className="text-amber-500 shrink-0 mt-0.5 sm:mt-0"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-amber-900">
          Klientský profil není úplný.
        </span>{" "}
        <span className="text-amber-800">
          {buildIncompleteMessage(incomplete)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {pendingAiFields.length > 0 && provenance?.reviewId && (
          <Link
            href={`/portal/contracts/review/${provenance.reviewId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors min-h-[32px]"
          >
            <Clock size={12} aria-hidden />
            Potvrdit z AI Review
          </Link>
        )}
        {manualFields.length > 0 && (
          <ManualFillCta contactId={contactId} />
        )}
      </div>
    </div>
  );
}

function buildIncompleteMessage(incomplete: IdentityFieldResult[]): string {
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

function ManualFillCta({ contactId }: { contactId: string }) {
  return (
    <Link
      href={`/portal/contacts/${contactId}/edit`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition-colors min-h-[32px]"
    >
      <Pencil size={12} aria-hidden />
      Doplnit ručně
    </Link>
  );
}
