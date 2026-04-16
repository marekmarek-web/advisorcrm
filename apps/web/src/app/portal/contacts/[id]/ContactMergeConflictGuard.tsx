"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, X, CheckCheck } from "lucide-react";
import type { ContactMergeConflictField } from "@/app/actions/contacts";

type Props = {
  mergeConflicts: ContactMergeConflictField[];
  contactId: string;
  reviewId: string | null | undefined;
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "Jméno",
  lastName: "Příjmení",
  email: "E-mail",
  phone: "Telefon",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  idCardNumber: "Číslo OP",
  street: "Ulice",
  city: "Město",
  zip: "PSČ",
  address: "Adresa",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function ContactMergeConflictGuard({ mergeConflicts, contactId, reviewId }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  function dismiss() {
    setDismissed(true);
    // Refresh server data so provenance badges in header also update
    router.refresh();
  }

  if (!mergeConflicts.length || dismissed) return null;

  // Pouze manual_protected konflikty — data jsou v kontaktu, AI měla odlišnou hodnotu.
  // Pokud všechny jsou manual_protected (existující data mají přednost), nabídneme jen dismiss.
  const allManualProtected = mergeConflicts.every((c) => c.reason === "manual_protected");

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 sm:px-4 text-sm flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <GitMerge size={15} className="text-orange-500 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0 break-words">
            <span className="font-semibold text-orange-900">
              AI kontrola přinesla odlišné hodnoty pro {mergeConflicts.length === 1 ? "toto pole" : "tato pole"}.
            </span>{" "}
            <span className="text-orange-800">
              {allManualProtected
                ? "Vaše manuální data mají přednost — vše v pořádku. Potvrďte přečtení pro odebrání upozornění."
                : "Stávající manuální data byla zachována. Zkontrolujte a případně doplňte ručně."}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-1 rounded hover:bg-orange-100 text-orange-500 hover:text-orange-700 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
          aria-label="Zavřít upozornění"
          title="Zavřít upozornění"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <ul className="pl-3 sm:pl-5 space-y-1.5 min-w-0">
        {mergeConflicts.map(({ fieldKey, incomingValue, reason }) => (
          <li key={fieldKey} className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-semibold text-orange-900 break-words">
              {fieldLabel(fieldKey)}
              {reason === "manual_protected" ? (
                <span className="ml-1.5 font-normal text-orange-700">(zachováno — manuální záznam má přednost)</span>
              ) : null}
            </span>
            {incomingValue ? (
              <span className="text-xs text-orange-700 pl-0.5 break-words">
                AI navrhovala:{" "}
                <span className="font-mono bg-orange-100 px-1 rounded break-all inline-block max-w-full align-top">
                  {incomingValue}
                </span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="pl-3 sm:pl-5 flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
        {allManualProtected ? (
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-orange-700 transition-colors min-h-[44px] sm:min-h-[32px] w-full sm:w-auto"
          >
            <CheckCheck size={13} aria-hidden />
            Beru na vědomí, data jsou správně
          </button>
        ) : (
          <Link
            href={`/portal/contacts/${contactId}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-50 transition-colors min-h-[44px] sm:min-h-[32px] w-full sm:w-auto"
          >
            Doplnit ručně
          </Link>
        )}
        {reviewId && (
          <Link
            href={`/portal/contracts/review/${reviewId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-50 transition-colors min-h-[44px] sm:min-h-[32px] w-full sm:w-auto"
          >
            Zobrazit AI Review
          </Link>
        )}
      </div>
    </div>
  );
}
