"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Pencil } from "lucide-react";
import type { ContactAiProvenanceResult } from "@/app/actions/contacts";
import type { ContactRow } from "@/app/actions/contacts";
import { confirmContactPendingFieldAction } from "@/app/actions/contacts";
import {
  resolveIdentityCompleteness,
  buildIncompleteMessage,
} from "./contact-identity-completeness-logic";

// Re-exporty pro zpětnou kompatibilitu s testy a ostatními importery
export type { IdentityFieldStatus, IdentityFieldResult } from "./contact-identity-completeness-logic";
export { resolveIdentityCompleteness } from "./contact-identity-completeness-logic";

type Props = {
  contact: Pick<ContactRow, "birthDate" | "personalId">;
  provenance: ContactAiProvenanceResult;
  contactId: string;
};

/**
 * Fáze 15: Contact Identity Completeness Guard s inline pending confirm.
 * Nezobrazuje se, pokud jsou všechna klíčová pole splněna.
 *
 * Pokud je pole ve stavu pending_ai, zobrazí "Potvrdit z AI Review" button,
 * který zavolá confirmContactPendingFieldAction přímo bez přechodu na review stránku.
 */
export function ContactIdentityCompletenessGuard({ contact, provenance, contactId }: Props) {
  const router = useRouter();
  const [confirmingFields, setConfirmingFields] = useState<Record<string, boolean>>({});
  const [confirmedLocally, setConfirmedLocally] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const results = resolveIdentityCompleteness(contact, provenance);
  const incomplete = results.filter((r) => r.status !== "ok" && !confirmedLocally[r.key]);

  if (incomplete.length === 0) return null;

  const pendingAiFields = incomplete.filter((r) => r.status === "pending_ai");
  const manualFields = incomplete.filter((r) => r.status === "manual");

  async function handleConfirmField(fieldKey: string) {
    if (!provenance?.reviewId) return;
    if (confirmingFields[fieldKey]) return;

    setConfirmingFields((prev) => ({ ...prev, [fieldKey]: true }));
    setErrors((prev) => ({ ...prev, [fieldKey]: "" }));

    try {
      const result = await confirmContactPendingFieldAction(provenance.reviewId, fieldKey);
      if (result.ok) {
        setConfirmedLocally((prev) => ({ ...prev, [fieldKey]: true }));
        // Refresh server data — přepočítá provenance a guard
        router.refresh();
      } else {
        setErrors((prev) => ({ ...prev, [fieldKey]: result.error }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [fieldKey]: "Potvrzení selhalo. Zkuste to znovu." }));
    } finally {
      setConfirmingFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
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
      </div>

      {/* Pending AI pole — inline confirm buttons */}
      {pendingAiFields.length > 0 && provenance?.reviewId && (
        <div className="flex flex-wrap gap-2 pl-6 sm:pl-0">
          {pendingAiFields.map((field) => {
            const isLoading = confirmingFields[field.key];
            const fieldError = errors[field.key];
            return (
              <div key={field.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleConfirmField(field.key)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors min-h-[32px] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                      Potvrzuji…
                    </>
                  ) : (
                    <>
                      <CheckCircle size={12} aria-hidden />
                      Potvrdit z AI Review — {field.label}
                    </>
                  )}
                </button>
                {fieldError && (
                  <span className="text-xs text-red-600 pl-1">{fieldError}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pokud reviewId chybí ale jsou pending_ai pole — fallback */}
      {pendingAiFields.length > 0 && !provenance?.reviewId && (
        <div className="pl-6 sm:pl-0 text-xs text-amber-700">
          Potvrzení vyžaduje přístup k AI Review.
        </div>
      )}

      {/* Manual pole */}
      {manualFields.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-6 sm:pl-0">
          <ManualFillCta contactId={contactId} />
        </div>
      )}
    </div>
  );
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
