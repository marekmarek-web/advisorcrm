"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight, ExternalLink } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";

const PREVIEW_COUNT = 4;

function sourceKindLabel(kind: string): string {
  switch (kind) {
    case "document":
      return "Dokument";
    case "ai_review":
      return "AI kontrola";
    case "import":
      return "Import";
    default:
      return "Ručně";
  }
}

export function ContactProductsPreview({ contactId }: { contactId: string }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    getContractsByContact(contactId)
      .then((list) => setContracts(list.slice(0, PREVIEW_COUNT)))
      .catch(() => {
        setContracts([]);
        setLoadError("Nepodařilo se načíst smlouvy.");
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  const displayName = (c: ContractRow) =>
    c.productName || c.partnerName || `Smlouva ${c.segment}`;

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center justify-between">
        <h2 className="text-lg font-black text-[color:var(--wp-text)] flex items-center gap-2">
          <Briefcase size={20} className="text-indigo-500" aria-hidden />
          Sjednané a rozjednané produkty
        </h2>
        <Link
          href="#smlouvy"
          className="text-sm font-black text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 min-h-[44px]"
          onClick={() => { window.location.hash = "smlouvy"; }}
        >
          Zobrazit vše <ChevronRight size={16} />
        </Link>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-[color:var(--wp-text-tertiary)]">Načítám…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné smlouvy.</p>
        ) : (
          contracts.map((c) => (
            <Link
              key={c.id}
              href="#smlouvy"
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
                  <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>Zdroj: {sourceKindLabel(c.sourceKind)}</span>
                    {c.sourceDocumentId ? (
                      <a
                        href={`/api/documents/${c.sourceDocumentId}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 font-semibold inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Dokument <ExternalLink className="w-3 h-3" aria-hidden />
                      </a>
                    ) : null}
                    {c.sourceContractReviewId ? (
                      <Link
                        href={`/portal/contracts/review/${c.sourceContractReviewId}`}
                        className="text-indigo-600 font-semibold inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        AI kontrola <ExternalLink className="w-3 h-3" aria-hidden />
                      </Link>
                    ) : null}
                  </p>
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
          href="#smlouvy&add=1"
          className="w-full py-4 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 mt-2 min-h-[44px]"
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "smlouvy&add=1";
            window.dispatchEvent(new CustomEvent("contact-open-add-contract"));
          }}
        >
          <span className="text-base">+</span> Přidat produkt
        </Link>
      </div>
    </div>
  );
}
