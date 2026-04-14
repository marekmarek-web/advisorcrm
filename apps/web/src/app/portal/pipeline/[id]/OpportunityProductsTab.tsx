"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/products/canonical-product-read";

export function OpportunityProductsTab({
  contactId,
  contactName,
}: {
  contactId: string | null;
  contactName: string;
}) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    getContractsByContact(contactId)
      .then((rows) => {
        setContracts(rows);
      })
      .catch(() => {
        setContracts([]);
        setLoadError("Nepodařilo se načíst smlouvy klienta. Zkuste obnovit stránku.");
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  if (!contactId) {
    return (
      <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
        Pro zobrazení produktů přiřaďte obchodu klienta (kontakt).
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Načítání…</p>;
  }
  if (loadError) {
    return <p className="text-sm font-medium text-red-600">{loadError}</p>;
  }
  if (contracts.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-6 text-center">
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
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
        <h3 className="text-lg font-black text-[color:var(--wp-text)]">Sjednávané produkty</h3>
      </div>
      <ul className="space-y-3">
        {contracts.map((c) => {
          const p = mapContractToCanonicalProduct(c);
          const rawName = p.productName?.trim();
          const title = rawName || p.segmentLabel;
          const premium = c.premiumAnnual
            ? `${Number(c.premiumAnnual).toLocaleString("cs-CZ")} Kč/rok`
            : "—";
          const subtitle =
            [p.partnerName, rawName && rawName !== title ? rawName : null].filter(Boolean).join(" · ") ||
            p.segmentLabel;
          return (
            <li
              key={c.id}
              className="p-4 sm:p-5 border border-[color:var(--wp-surface-card-border)] rounded-2xl bg-[color:var(--wp-surface-card)] shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
                  <ShieldAlert size={20} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[color:var(--wp-text)] text-base leading-snug">
                    {title}
                    {c.contractNumber ? (
                      <span className="text-[color:var(--wp-text-secondary)] font-semibold text-sm block mt-0.5">
                        č. smlouvy {c.contractNumber}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-1 truncate">{subtitle}</p>
                </div>
              </div>
              <div className="text-lg font-black text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] shrink-0 self-start sm:self-center">
                {premium}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] pt-1">
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
