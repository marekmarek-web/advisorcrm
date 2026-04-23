"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createClientPortalRequest } from "@/app/actions/client-portal-requests";

type Props = {
  caseType: string;
  subject: string;
  description: string;
  calculatorSnapshot: Record<string, unknown>;
};

/**
 * CTA: uložit výstup kalkulačky jako obchod / požadavek s JSON snapshotem v custom_fields.
 */
export function ClientCalculatorSendToAdvisorSection({ caseType, subject, description, calculatorSnapshot }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="mt-4 rounded-[20px] border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
      <p className="text-sm font-bold text-[color:var(--wp-text)] mb-1">Pošlete výsledek poradci</p>
      <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium mb-3">
        Založí se požadavek s vašimi zadanými hodnotami a výsledkem — poradce je uvidí v CRM u obchodu.
      </p>
      {error ? (
        <p className="text-sm text-red-600 font-medium mb-2" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await createClientPortalRequest({
              caseType,
              subject,
              description,
              calculatorSnapshot,
            });
            if (r.success) {
              await router.push("/client/requests");
              router.refresh();
            } else {
              setError(r.error);
            }
          });
        }}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-60 w-full sm:w-auto"
      >
        <Send size={16} aria-hidden />
        {pending ? "Odesílám…" : "Poslat poradci"}
      </button>
    </div>
  );
}
