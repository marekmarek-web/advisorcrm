"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";

export function OpportunityProductsTab({
  contactId,
  contactName,
}: {
  contactId: string | null;
  contactName: string;
}) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) {
      setLoading(false);
      return;
    }
    getContractsByContact(contactId)
      .then(setContracts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contactId]);

  if (!contactId) {
    return (
      <p className="text-sm font-medium text-slate-500">
        Pro zobrazení produktů přiřaďte obchodu klienta (kontakt).
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm font-medium text-slate-500">Načítání…</p>;
  }
  if (contracts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
        <p className="text-sm font-medium text-slate-600">
          Klient {contactName} zatím nemá evidované smlouvy.{" "}
          <Link
            href={`/portal/contacts/${contactId}`}
            className="font-black text-indigo-600 hover:underline min-h-[44px] inline-flex items-center"
          >
            Přidat v detailu kontaktu
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-black text-slate-900">Sjednávané produkty</h3>
      </div>
      <ul className="space-y-3">
        {contracts.map((c) => {
          const premium = c.premiumAnnual
            ? `${Number(c.premiumAnnual).toLocaleString("cs-CZ")} Kč/rok`
            : "—";
          const subtitle = [c.partnerName, c.productName].filter(Boolean).join(" · ") || "—";
          return (
            <li
              key={c.id}
              className="p-4 sm:p-5 border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
                  <ShieldAlert size={20} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-base leading-snug">
                    {c.segment || "Produkt"}
                    {c.contractNumber ? (
                      <span className="text-slate-500 font-semibold text-sm block mt-0.5">
                        č. smlouvy {c.contractNumber}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-bold text-slate-500 mt-1 truncate">{subtitle}</p>
                </div>
              </div>
              <div className="text-lg font-black text-slate-800 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 shrink-0 self-start sm:self-center">
                {premium}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-medium text-slate-500 pt-1">
        <Link
          href={`/portal/contacts/${contactId}`}
          className="font-black text-indigo-600 hover:underline min-h-[44px] inline-flex items-center"
        >
          Otevřít detail kontaktu a smlouvy
        </Link>
      </p>
    </div>
  );
}
