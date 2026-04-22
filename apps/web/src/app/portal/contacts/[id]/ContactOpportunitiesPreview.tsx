"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight, Plus } from "lucide-react";
import { getOpenOpportunitiesByContactWithMeta } from "@/app/actions/pipeline";

type OpportunitySummary = { id: string; caseType: string; updatedAt: Date };

export function ContactOpportunitiesPreview({
  contactId,
  baseQueryNoTab,
  canWrite,
}: {
  contactId: string;
  baseQueryNoTab: string;
  canWrite: boolean;
}) {
  const [deals, setDeals] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getOpenOpportunitiesByContactWithMeta(contactId)
      .then((list) => {
        setDeals(list);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [contactId]);

  const tabHref = buildHref(contactId, baseQueryNoTab, "obchody");
  const newDealHref = buildHref(contactId, baseQueryNoTab, "obchody", true);

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center justify-between">
        <h2 className="text-lg font-black text-[color:var(--wp-text)] flex items-center gap-2">
          <Briefcase size={20} className="text-emerald-500" aria-hidden />
          Obchody
        </h2>
        <Link
          href={tabHref}
          scroll={false}
          className="text-sm font-black text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 min-h-[44px]"
        >
          Zobrazit vše <ChevronRight size={16} />
        </Link>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-[color:var(--wp-text-tertiary)]">Načítám…</p>
        ) : error ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Obchody se nepodařilo načíst.
          </p>
        ) : deals.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné rozpracované obchody.</p>
        ) : (
          <p className="text-sm text-[color:var(--wp-text)]">
            <span className="font-bold">{deals.length}</span>{" "}
            {deals.length === 1 ? "rozpracovaný obchod" : deals.length < 5 ? "rozpracované obchody" : "rozpracovaných obchodů"}
          </p>
        )}
        {canWrite && (
          <Link
            href={newDealHref}
            scroll={false}
            className="w-full py-4 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Plus size={14} /> Nový obchod
          </Link>
        )}
      </div>
    </div>
  );
}

function buildHref(
  contactId: string,
  baseQueryNoTab: string,
  tab: string,
  newOpportunity?: boolean,
): string {
  const p = new URLSearchParams(baseQueryNoTab);
  p.set("tab", tab);
  p.delete("add");
  if (newOpportunity) p.set("newOpportunity", "1");
  return `/portal/contacts/${contactId}?${p.toString()}`;
}
