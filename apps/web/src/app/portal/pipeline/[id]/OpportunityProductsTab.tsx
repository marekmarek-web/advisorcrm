"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
      <p className="text-sm text-slate-500">
        Pro zobrazení produktů přiřaďte obchodu klienta (kontakt).
      </p>
    );
  }
  if (loading) return <p className="text-sm text-slate-500">Načítání…</p>;
  if (contracts.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Klient {contactName} zatím nemá evidované smlouvy.{" "}
        <Link href={`/portal/contacts/${contactId}`} className="text-blue-600 hover:underline">
          Přidat v detailu kontaktu
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left p-3 font-medium text-slate-700">Segment</th>
            <th className="text-left p-3 font-medium text-slate-700">Partner / Produkt</th>
            <th className="text-left p-3 font-medium text-slate-700">Č. smlouvy</th>
            <th className="text-left p-3 font-medium text-slate-700">Pojistné</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id} className="border-b border-slate-100 last:border-0">
              <td className="p-3 text-slate-600">{c.segment}</td>
              <td className="p-3">
                {c.partnerName ?? "—"} / {c.productName ?? "—"}
              </td>
              <td className="p-3 text-slate-600">{c.contractNumber ?? "—"}</td>
              <td className="p-3">
                {c.premiumAnnual ? `${Number(c.premiumAnnual).toLocaleString("cs-CZ")} Kč` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-xs text-slate-500 border-t border-slate-100">
        <Link href={`/portal/contacts/${contactId}`} className="text-blue-600 hover:underline">
          Otevřít detail kontaktu a smlouvy
        </Link>
      </p>
    </div>
  );
}
