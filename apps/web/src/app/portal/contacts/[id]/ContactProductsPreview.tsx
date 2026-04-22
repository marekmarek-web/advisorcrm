"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/products/canonical-product-read";
import { ContractProvenanceLine } from "@/app/components/aidvisora/ContractProvenanceLine";
import type { ContactTabId } from "./contact-detail-tabs";

const PREVIEW_COUNT = 4;

function buildContactDetailHref(
  contactId: string,
  baseQueryNoTab: string,
  tab: ContactTabId,
  opts?: { addContract?: boolean }
): string {
  const p = new URLSearchParams(baseQueryNoTab);
  const resolvedTab: ContactTabId = opts?.addContract ? "prehled" : tab;
  p.set("tab", resolvedTab);
  if (opts?.addContract) p.set("add", "1");
  else p.delete("add");
  const q = p.toString();
  return `/portal/contacts/${contactId}?${q}`;
}

export function ContactProductsPreview({
  contactId,
  baseQueryNoTab,
}: {
  contactId: string;
  /** Výsledek `contactDetailQueryWithoutTab` — bez `tab`. */
  baseQueryNoTab: string;
}) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getContractsByContact(contactId)
      .then((list) => {
        setLoadError(null);
        setContracts(list.slice(0, PREVIEW_COUNT));
      })
      .catch(() => {
        setContracts([]);
        setLoadError("Nepodařilo se načíst smlouvy.");
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  const displayName = (c: ContractRow) => {
    const p = mapContractToCanonicalProduct(c);
    return p.productName?.trim() || p.segmentLabel;
  };

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center justify-between">
        <h2 className="text-lg font-black text-[color:var(--wp-text)] flex items-center gap-2">
          <Briefcase size={20} className="text-indigo-500" aria-hidden />
          Sjednané a rozjednané produkty
        </h2>
        <Link
          href={buildContactDetailHref(contactId, baseQueryNoTab, "prehled")}
          scroll={false}
          className="text-sm font-black text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 min-h-[44px]"
        >
          Zobrazit vše <ChevronRight size={16} />
        </Link>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {loading ? (
          <p className="text-sm text-[color:var(--wp-text-tertiary)]">Načítání…</p>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800" role="alert">
            {loadError}
          </div>
        ) : contracts.length === 0 ? (
          <p className="max-w-prose text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">
            V tomto náhledu zatím nejsou žádné smlouvy. Přidejte je v Přehledu nebo počkejte na zápis z AI Review.
          </p>
        ) : (
          contracts.map((c) => (
            <Link
              key={c.id}
              href={buildContactDetailHref(contactId, baseQueryNoTab, "prehled")}
              scroll={false}
              className="p-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] hover:border-indigo-200 hover:shadow-md transition-all bg-[color:var(--wp-surface-muted)]/30 group flex flex-col md:flex-row md:items-center justify-between gap-4 min-h-[44px]"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <Briefcase size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[color:var(--wp-text)] text-[15px] group-hover:text-indigo-600 transition-colors truncate">
                    {displayName(c)}
                  </h3>
                  <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">
                    {c.partnerName ?? "—"}
                  </p>
                  <div className="mt-1">
                    <ContractProvenanceLine
                      sourceKind={c.sourceKind}
                      sourceDocumentId={c.sourceDocumentId}
                      sourceContractReviewId={c.sourceContractReviewId}
                      advisorConfirmedAt={c.advisorConfirmedAt}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:text-right">
                {c.premiumAmount && (
                  <span className="text-sm font-black text-[color:var(--wp-text)]">{c.premiumAmount}</span>
                )}
                <ChevronRight size={20} className="text-[color:var(--wp-text-tertiary)] group-hover:text-indigo-600 transition-colors shrink-0" />
              </div>
            </Link>
          ))
        )}
        <Link
          href={buildContactDetailHref(contactId, baseQueryNoTab, "prehled", { addContract: true })}
          scroll={false}
          className="w-full py-4 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 mt-2 min-h-[44px]"
        >
          <span className="text-base">+</span> Přidat produkt
        </Link>
      </div>
    </div>
  );
}
