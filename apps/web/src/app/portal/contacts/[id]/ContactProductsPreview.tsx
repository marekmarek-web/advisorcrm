"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";

const PREVIEW_COUNT = 4;

export function ContactProductsPreview({ contactId }: { contactId: string }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getContractsByContact(contactId)
      .then((list) => setContracts(list.slice(0, PREVIEW_COUNT)))
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [contactId]);

  const displayName = (c: ContractRow) =>
    c.productName || c.partnerName || `Smlouva ${c.segment}`;

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
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
          <p className="text-sm text-slate-400">Načítám…</p>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-slate-500">Žádné smlouvy.</p>
        ) : (
          contracts.map((c) => (
            <Link
              key={c.id}
              href="#smlouvy"
              className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all bg-slate-50/30 group flex flex-col md:flex-row md:items-center justify-between gap-4 min-h-[44px]"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <Briefcase size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-[15px] group-hover:text-indigo-600 transition-colors truncate">
                    {displayName(c)}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 truncate">
                    {c.partnerName ?? "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:text-right">
                {c.premiumAmount && (
                  <span className="text-sm font-black text-slate-900">{c.premiumAmount}</span>
                )}
                <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
              </div>
            </Link>
          ))
        )}
        <Link
          href="#smlouvy&add=1"
          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 mt-2 min-h-[44px]"
        >
          <span className="text-base">+</span> Přidat produkt
        </Link>
      </div>
    </div>
  );
}
